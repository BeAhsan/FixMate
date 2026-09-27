<?php

namespace App\Http\Resources\Accounts;

use App\Application\IdentityAndAccess\DTOs\AccountSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The result of promoting an administrator: the new account, and a warning if the
 * role has become too wide.
 *
 * The warning is a field on the response rather than a log line or a header,
 * because the person who needs to read it is the person who just clicked promote.
 * A warning nobody sees is not a guard rail, it is a note.
 *
 * `warning` is present-and-null rather than absent when there is nothing to say.
 * A field that appears and disappears is a field four front ends each have to
 * branch on, and one of them will branch on it wrongly; a field that is always
 * there and is sometimes null is one check.
 *
 * The sentence is written by the use case, not here. It is a judgement about how
 * many super administrators is too many, and that judgement belongs with the rule
 * that enforces it, so changing the threshold changes the sentence in the same
 * place. This resource only decides where the sentence goes.
 *
 * The payload is held in a property of its own rather than in a promoted
 * constructor argument called `$resource`. `JsonResource` already declares a
 * public `$resource`, so redeclaring it as a promoted `private readonly array` is
 * an access-level conflict and the class will not load at all — which is a fatal
 * at the moment the controller first reaches this line, not a mistake caught by a
 * static analyser.
 */
class PromotedAccountResource extends JsonResource
{
    /**
     * @param  array{account: AccountSummary, warning: ?string}  $payload
     */
    public function __construct(private readonly array $payload)
    {
        parent::__construct($payload['account']);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'account' => (new AccountSummaryResource($this->payload['account']))->toArray($request),
            'warning' => $this->payload['warning'],
        ];
    }
}
