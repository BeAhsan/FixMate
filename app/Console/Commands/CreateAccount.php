<?php

namespace App\Console\Commands;

use App\Domain\IdentityAndAccess\Services\PasswordPolicy;
use App\Domain\IdentityAndAccess\ValueObjects\AccountType;
use App\Domain\IdentityAndAccess\ValueObjects\Email;
use App\Infrastructure\IdentityAndAccess\AccountTypeRegistry;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Creates one account, of any of the four types, with a password nobody chose.
 *
 * **This exists because there was no other way to create the first
 * administrator.** A fresh install had no provisioning path at all: no
 * registration, no invitation, no staff-creation endpoint, and a seeder that made
 * one test user with a known password. Somebody deploying this for the first time
 * had no way to sign in as a super administrator except by editing a database.
 * That gap was found while writing ticket 26, where it had been hiding behind a
 * question about a password flag.
 *
 * ## The password is generated, and shown once
 *
 * A password an operator picks is a password in a shell history, in a process
 * listing, and in whatever the person copies it into. So one is generated here,
 * printed exactly once, and never stored in plaintext or written to a log. If it
 * is lost, the answer is to run the command again with a different address — which
 * is why the address is an argument rather than something inferred.
 *
 * The generated password satisfies {@see PasswordPolicy},
 * so the new owner can go straight to the reset flow and choose their own without
 * the generated one being rejected on arrival. That is the whole of story 21 for
 * now: the owner ends up setting their own password, just by a route that already
 * exists rather than one this command forces them down.
 *
 * ## What this deliberately does not do
 *
 * **It does not set a `must_change_password` flag.** The column could be added
 * here and the provisioning would look tidier, but nothing would enforce it: the
 * guard that refuses every other route while the flag is set does not exist until
 * ticket 26. A flag that is set and never checked is worse than no flag, because
 * it reads as protection on the record of every account created by this command
 * and enforces nothing. The enforcement and the flag land together.
 *
 * **It does not look in the other three stores.** Each credential store is
 * isolated, and an operator who asks whether an address is free is entitled to an
 * answer about the one store they are provisioning into — not a report on which
 * other three hold it. Checking the others would turn a provisioning tool into a
 * cross-store account oracle, and the isolation the credential-store tests assert
 * would have a command-shaped hole in it. The uniqueness constraint is per table
 * anyway, so two accounts of different types sharing an address stays possible
 * and is not this command's business.
 *
 * **It does not create a token or a session.** It writes a row. Everything about
 * signing in is the front end's and the API's.
 */
class CreateAccount extends Command
{
    protected $signature = 'fixmate:create-account
                            {type : Which kind of account: users, workers, admins, super_admins}
                            {--name= : The person\'s name. Prompted for if absent}
                            {--email= : Their email address. Prompted for if absent}
                            {--password= : Set it yourself instead of generating one. Avoid this: an argument is visible in shell history and in the process listing}';

    protected $description = 'Create one account with a generated password, and print that password once';

    public function handle(): int
    {
        $type = AccountType::tryFrom($this->argument('type'));

        if (! $type) {
            $this->error(
                'Unknown account type "'.$this->argument('type').'". Expected one of: '
                .implode(', ', array_column(AccountType::cases(), 'value')).'.'
            );

            return self::FAILURE;
        }

        $name = $this->option('name') ?: $this->ask('Name');
        $email = $this->option('email') ?: $this->ask('Email address');

        if (! is_string($name) || trim($name) === '') {
            $this->error('A name is required.');

            return self::FAILURE;
        }

        try {
            $address = Email::from((string) $email);
        } catch (\InvalidArgumentException $e) {
            $this->error('That is not a usable email address: '.$e->getMessage());

            return self::FAILURE;
        }

        $model = $this->modelFor($type);

        // Only this store. See the class docblock for why the other three are not
        // consulted.
        if ($model::query()->whereRaw('LOWER(email) = ?', [Str::lower($address->value)])->exists()) {
            $this->error(
                'That address already has a '.$type->label().' account. Nothing was created. '
                .'If this is meant to be a different person, use a different address.'
            );

            return self::FAILURE;
        }

        $password = $this->resolvePassword();

        if ($password === null) {
            $this->error(
                'The generated password did not satisfy the password policy, which is a bug in '
                .'this command rather than anything the operator did. '
                .'Pass one with --password instead.'
            );

            return self::FAILURE;
        }

        $account = $model::query()->create([
            'name' => trim((string) $name),
            'email' => $address->value,
            'password' => Hash::make($password),
            'status' => 'active',
            // The flag, and the reason the ticket that introduced this command
            // could not set it at the time. `EnsurePasswordChanged` exists now, so
            // setting it is no longer a claim without a control behind it: until the
            // new owner replaces this password, every other route refuses them and
            // the reset flow is their way out.
            //
            // An account created by this command has, by definition, never chosen its
            // own password. So this is true of every account the command has ever
            // made, which is the property story 21 is about.
            'must_change_password' => true,
        ]);

        $this->reportCreated($type, $account, $password);

        return self::SUCCESS;
    }

    /**
     * @return class-string<Model>
     */
    private function modelFor(AccountType $type): string
    {
        /** @var class-string<Model> $model */
        $model = AccountTypeRegistry::modelFor($type);

        return $model;
    }

    /**
     * The password to set: the operator's, or a generated one.
     *
     * The generated one is checked against the real policy rather than assumed to
     * satisfy it. A generator that happened to produce sixteen lowercase letters
     * would hand the new owner a password the reset flow rejects, and they would
     * be locked out of an account that was created a second earlier — so the
     * characters are drawn from four classes and the result is verified anyway.
     */
    private function resolvePassword(): ?string
    {
        $given = $this->option('password');

        if (is_string($given) && $given !== '') {
            $this->warn(
                'You set this password on the command line, so it is in your shell history '
                .'and in the process listing. Treat it as compromised and use the reset '
                .'flow to replace it.'
            );

            return $given;
        }

        return $this->generatePassword();
    }

    /**
     * A generated password, or a loud failure if one cannot be produced.
     *
     * There is no retry loop here, and there used to be. `candidate()` draws one
     * character from each of four classes and twelve more from all of them, so it
     * satisfies `PasswordPolicy` by construction and never failed the check — and
     * mutation testing showed that *no test could tell the looped version from the
     * unlooped one*, because the branch was unreachable. A branch nothing can
     * reach reads as a safeguard and is not one, so the retry is gone and the
     * guarantee is stated as an assertion instead: if a future edit to
     * `candidate()` ever breaks the policy, this fails immediately and says so,
     * rather than twenty times over and then giving up.
     *
     * The property is still covered from the outside —
     * `CreateAccountCommandTest::test_the_generated_password_is_acceptable_to_the_password_policy`
     * generates several and checks each against the real policy — so what changed
     * is that the code now asserts the invariant rather than quietly retrying.
     *
     * Returns null rather than calling `exit()`. A command that cannot do its job
     * should return a failing status and let `handle()` decide what to print;
     * `exit()` tears the process down, and under a test runner that kills the whole
     * suite. A generated password with no digit in it turned one test into twelve
     * errors, which buries the one that was actually about it.
     */
    private function generatePassword(): ?string
    {
        $candidate = $this->candidate();

        return $this->satisfies($candidate, PasswordPolicy::rules()) ? $candidate : null;
    }

    /**
     * Sixteen characters, one from each of four classes, then shuffled.
     *
     * Drawn per class and then shuffled rather than sampled from a combined
     * alphabet: sampling can legitimately produce a password with no digit in it,
     * and the policy requires one. Taking one of each guarantees the shape, and
     * the shuffle stops the guaranteed characters sitting in a predictable
     * position.
     */
    private function candidate(): string
    {
        $classes = [
            'abcdefghijkmnopqrstuvwxyz',
            'ABCDEFGHJKLMNPQRSTUVWXYZ',
            '23456789',
            '!@#$%^&*-_=+',
        ];

        $characters = '';

        foreach ($classes as $class) {
            $characters .= $class[random_int(0, strlen($class) - 1)];
        }

        $all = implode('', $classes);

        for ($i = 0; $i < 12; $i++) {
            $characters .= $all[random_int(0, strlen($all) - 1)];
        }

        $shuffled = str_split($characters);

        // Fisher-Yates with a cryptographic source. `shuffle()` uses the global
        // PRNG, which is fine for a card deck and not for a credential.
        for ($i = count($shuffled) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$shuffled[$i], $shuffled[$j]] = [$shuffled[$j], $shuffled[$i]];
        }

        return implode('', $shuffled);
    }

    /**
     * @param  array<int, mixed>  $policy
     */
    private function satisfies(string $candidate, array $policy): bool
    {
        $validator = validator(
            ['password' => $candidate],
            ['password' => $policy],
        );

        return ! $validator->fails();
    }

    private function reportCreated(AccountType $type, Model $account, string $password): void
    {
        $this->newLine();
        $this->line('  Created a '.$type->label().' account.');
        $this->line('  Name:  '.$account->getAttribute('name'));
        $this->line('  Email: '.$account->getAttribute('email'));
        $this->newLine();

        // The one moment the password is visible anywhere. The surrounding lines
        // are loud about that, because a password read once and forgotten locks
        // somebody out of an account that exists.
        $this->line('  <options=bold>Password: '.$password.'</>');
        $this->newLine();
        $this->warn('  This is the only time it is shown. It is not stored in readable form');
        $this->warn('  and it is not written to any log. If you lose it, run this command');
        $this->warn('  again with a different address, or use the password reset flow.');
        $this->newLine();
        $this->line('  This account must set a password of its own before it can be used.');
        $this->newLine();
        $this->line('  Sign in at the '.$type->label().' application with the password above,');
        $this->line('  and you will be taken straight to a screen to choose a new one. Until');
        $this->line('  you do, every other part of the application refuses the session.');
        $this->newLine();
    }
}
