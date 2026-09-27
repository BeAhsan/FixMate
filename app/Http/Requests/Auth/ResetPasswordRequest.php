<?php

namespace App\Http\Requests\Auth;

use App\Domain\IdentityAndAccess\Services\PasswordPolicy;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Form request for completing a password reset.
 *
 * The new password is checked here, before the controller or the use case sees
 * it, and that ordering is load-bearing rather than tidy. The token is single
 * use: redeeming it and *then* discovering the password is unacceptable would
 * burn the one link the person was sent and leave them unable to finish, having
 * been told only that the link was fine. Validating first means an unacceptable
 * password costs nothing and the link is still there to retry with.
 */
class ResetPasswordRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', ...PasswordPolicy::rules()],
        ];
    }
}
