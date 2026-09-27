<?php

namespace App\Http\Requests\Auth;

use App\Domain\IdentityAndAccess\Services\PasswordPolicy;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A request to replace the signed-in account's password.
 *
 * Two fields and both are required. `current_password` is not a convenience: it is
 * what stops anybody holding a stolen access token from setting a new password and
 * locking the real owner out permanently. The token proves who is asking; the
 * current password proves it is the person rather than a copy of their session.
 *
 * The new password is checked against the same `PasswordPolicy::rules()` the reset
 * flow uses, and that shared reference is the point. A second rule set here would
 * drift, and the drift would show up as "my password was accepted at sign-in and
 * refused when I changed it".
 *
 * `current_password` is validated as present and non-empty but *not* against any
 * rule: whether it is correct is decided in the use case, against the stored hash,
 * and a validation-layer rejection would be a second opinion on a question that has
 * exactly one right answer. A wrong one is a 422 carrying the use case's message.
 */
class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        // True, and deliberately not a permission check. Changing your own password
        // is not a privilege, it is the one thing every signed-in account may do,
        // so there is no ability to name. The account is the authenticated one and
        // the use case resolves it from that — there is no identifier in the body
        // for a caller to change in order to reach somebody else's account.
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'different:current_password', ...PasswordPolicy::rules()],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        // Keyed to this request's field names, so the sign-in screen can render the
        // server's own wording rather than inventing a second one. A front end that
        // reworded a refusal here would be leaking *which* check failed, which is
        // more than a sign-in failure gives away and less than it would if the
        // person were told their new password was unacceptable.
        return [
            'current_password.required' => 'Enter the password this account is currently using.',
            'password.required' => 'Choose a new password.',
            'password.different' => 'That is the password this account is already using. Choose one you have not used here before.',
        ];
    }
}
