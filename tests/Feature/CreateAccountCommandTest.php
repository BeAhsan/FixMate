<?php

namespace Tests\Feature;

use App\Domain\IdentityAndAccess\Services\PasswordPolicy;
use App\Models\Admin;
use App\Models\SuperAdmin;
use App\Models\User;
use App\Models\Worker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Creating the first account, which until now there was no way to do.
 *
 * A fresh install had no provisioning path: no registration, no invitation, no
 * staff-creation endpoint, and a seeder that made one test user with a known
 * password. Somebody deploying this for the first time had no way to sign in as a
 * super administrator except by editing a database by hand.
 *
 * The command is asserted through its output rather than by calling its methods,
 * because the output *is* the deliverable. A provisioning command whose password
 * is not printed has provisioned nothing, and a test that inspected the database
 * would pass on a command that silently discarded the credential it generated.
 */
class CreateAccountCommandTest extends TestCase
{
    use RefreshDatabase;

    /** What the last `provision()` printed, so the password can be read back. */
    private ?string $lastOutput = null;

    /**
     * Run the command, assert it succeeded, and hand back everything it printed.
     *
     * `Artisan::call` rather than `$this->artisan()` because the output is the
     * deliverable here and has to be read as a string: the printed password is the
     * only place it exists.
     *
     * `Artisan::output()` is called **exactly once**. It reads from a
     * `BufferedOutput`, and `fetch()` drains the buffer rather than peeking at it,
     * so a second call returns an empty string. The first version of this helper
     * called it twice — once to build the assertion message, which PHP evaluates
     * whether or not the assertion passes, and once to keep the output — and every
     * test that read the password failed against an empty string. The message
     * argument of a passing assertion still runs its expression.
     */
    private function provision(string $type, array $options = []): string
    {
        $exit = Artisan::call('fixmate:create-account', array_merge([
            'type' => $type,
            '--name' => 'Ada Lovelace',
            '--email' => 'ada@example.test',
        ], $options));

        $output = Artisan::output();
        $this->lastOutput = $output;

        $this->assertSame(0, $exit, 'The command should have succeeded. It said: '.$output);

        return $output;
    }

    /** Run the command, assert it refused, and hand back what it said. */
    private function refuse(string $type, array $options): string
    {
        $exit = Artisan::call('fixmate:create-account', array_merge(['type' => $type], $options));

        $output = Artisan::output();

        $this->assertSame(1, $exit, 'The command should have refused. It said: '.$output);

        return $output;
    }

    // ---------------------------------------------------------------------
    // It creates the account where it said it would.
    // ---------------------------------------------------------------------

    public static function accountTypes(): array
    {
        return [
            'end user' => ['users', User::class, 'users'],
            'worker' => ['workers', Worker::class, 'workers'],
            'administrator' => ['admins', Admin::class, 'admins'],
            'super administrator' => ['super_admins', SuperAdmin::class, 'super_admins'],
        ];
    }

    #[DataProvider('accountTypes')]
    public function test_it_creates_the_account_in_the_right_store(string $type, string $model, string $table): void
    {
        $this->provision($type);

        $this->assertDatabaseHas($table, [
            'email' => 'ada@example.test',
            'name' => 'Ada Lovelace',
            'status' => 'active',
        ]);
        $this->assertSame(1, $model::query()->count());
    }

    public function test_the_password_is_shown_once_and_is_not_what_was_stored(): void
    {
        $output = $this->provision('admins');

        $password = $this->passwordFrom($output);
        $stored = Admin::query()->sole()->password;

        // Printed, or the account is unusable.
        $this->assertNotSame('', $password);

        // Not the plaintext. A command that hashed nothing would leave the
        // database holding a credential in readable form, and this is the one
        // assertion that would catch it.
        $this->assertNotSame($password, $stored);
        $this->assertTrue(Hash::check($password, $stored), 'The printed password should open the account.');
    }

    public function test_the_generated_password_is_acceptable_to_the_password_policy(): void
    {
        // The whole reason the generator is verified rather than assumed: a
        // password the reset flow rejects locks the new owner out of an account
        // created a second earlier.
        foreach (range(1, 5) as $ignored) {
            $this->provision('users', ['--email' => 'owner'.$ignored.'@example.test']);

            $password = $this->passwordFrom();

            $this->assertFalse(
                Validator::make(['password' => $password], ['password' => PasswordPolicy::rules()])->fails(),
                'A generated password was rejected by the policy: '.$password,
            );
        }
    }

    public function test_the_generated_passwords_are_not_all_the_same(): void
    {
        // A generator seeded per run would hand out the same credential to every
        // fresh install on earth, and this is cheap to check and invisible
        // otherwise.
        $seen = [];

        for ($i = 1; $i <= 3; $i++) {
            $this->provision('users', ['--email' => 'owner'.$i.'@example.test']);
            $seen[] = $this->passwordFrom();
        }

        $this->assertCount(3, array_unique($seen), 'Three runs produced identical passwords.');
    }

    public function test_the_address_is_normalised_the_way_sign_in_expects(): void
    {
        // Sign-in looks the address up lowercased, so a stored mixed-case address
        // would be an account that cannot be used.
        $this->provision('users', ['--email' => 'Ada.Lovelace@Example.TEST']);

        $this->assertSame('ada.lovelace@example.test', User::query()->sole()->email);
    }

    // ---------------------------------------------------------------------
    // The password is the sensitive part, so these are the security assertions.
    // ---------------------------------------------------------------------

    public function test_the_plaintext_password_is_not_written_to_the_log(): void
    {
        $this->provision('super_admins');

        $password = $this->passwordFrom();

        // The console output is for the operator at the terminal. A copy of the
        // credential that outlives the scrollback — in a log file, in a process
        // capture, in a CI transcript — is a copy that cannot be rotated.
        // The log's *contents*, not its existence. A log file may well exist by
        // the time this runs - the suite does plenty that writes one - and
        // asserting it does not exist would be asserting that nothing else in the
        // application logs anything, which is a different and much larger claim.
        // A file that does not exist trivially satisfies the check, which is the
        // right answer: nothing was logged.
        $log = storage_path('logs/laravel.log');

        $this->assertStringNotContainsString(
            $password,
            file_exists($log) ? (string) file_get_contents($log) : '',
            'The generated password was written to the log.',
        );
    }

    public function test_a_password_given_on_the_command_line_is_used_but_warned_about(): void
    {
        $output = $this->provision('admins', ['--password' => 'chosen-by-hand']);

        $this->assertTrue(Hash::check('chosen-by-hand', Admin::query()->sole()->password));
        $this->assertStringContainsStringIgnoringCase(
            'shell history',
            $output,
            'An operator-supplied password is in the history and the process list, and should be told so.',
        );
    }

    // ---------------------------------------------------------------------
    // What it refuses.
    // ---------------------------------------------------------------------

    public function test_it_refuses_an_address_that_already_has_an_account_in_the_same_store(): void
    {
        $this->provision('admins');

        $output = $this->refuse('admins', [
            '--name' => 'Somebody Else',
            '--email' => 'ADA@example.test',
        ]);

        $this->assertStringContainsString('already has', $output);

        $this->assertSame(1, Admin::query()->count(), 'The second run should not have created anything.');
    }

    public function test_it_does_not_consult_the_other_stores(): void
    {
        // The isolation property, and a hole in it if this were otherwise. An
        // operator provisioning into `admins` is entitled to an answer about the
        // admins table and nothing else; a command that reported "that address
        // already exists" when it only exists as a *customer* would turn a
        // provisioning tool into a cross-store account oracle.
        User::factory()->create(['email' => 'ada@example.test']);

        $this->provision('admins');

        $this->assertSame(1, Admin::query()->count());
        $this->assertSame(1, User::query()->count());
    }

    public function test_it_refuses_an_unknown_account_type(): void
    {
        $output = $this->refuse('wizards', [
            '--name' => 'Merlin',
            '--email' => 'merlin@example.test',
        ]);

        // It has to say which types are valid, or the operator is left guessing at
        // a value the command never named.
        $this->assertStringContainsString('super_admins', $output);

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('admins', 0);
    }

    public function test_it_refuses_an_unusable_email_address(): void
    {
        $this->refuse('admins', ['--name' => 'Ada', '--email' => 'not-an-address']);

        $this->assertDatabaseCount('admins', 0);
    }

    // ---------------------------------------------------------------------
    // The point of the whole thing.
    // ---------------------------------------------------------------------

    public function test_the_new_account_can_actually_sign_in(): void
    {
        // The assertion that matters. A row in a table is not a usable account,
        // and the whole failure this fixes was a first administrator who could not
        // get in.
        $this->provision('super_admins');

        $password = $this->passwordFrom();

        $response = $this->postJson('/api/v1/identity/super-admins/sign-in', [
            'email' => 'ada@example.test',
            'password' => $password,
        ]);

        $response->assertOk();

        // `super_admin`, not `user`: each sign-in returns the account under a key
        // named for its own type, so each application reads its own. Reaching for
        // `data.user` here would have been a plausible mistake that reads as a
        // provisioning failure rather than a wrong path.
        $response->assertJsonPath('data.super_admin.name', 'Ada Lovelace');
        $response->assertJsonPath('data.super_admin.email', 'ada@example.test');

        // A super administrator, so the wildcard reach is present - which is the
        // reason this account is worth having.
        $this->assertSame(['*'], $response->json('data.abilities'));
    }

    // ---------------------------------------------------------------------

    /**
     * Pull the printed password back out of the command's output.
     *
     * With no argument it reads the last `provision()` call's output, which is
     * what most of these tests want; the explicit form is for the ones that need
     * to look at a refusal instead.
     */
    private function passwordFrom(?string $output = null): string
    {
        $output ??= $this->lastOutput ?? '';

        $this->assertMatchesRegularExpression(
            '/Password: (\S+)/',
            $output,
            'The command printed no password, so the account it created is unusable.',
        );

        preg_match('/Password: (\S+)/', $output, $match);

        return $match[1];
    }
}
