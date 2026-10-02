<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Registration, answering `201` without creating anything.
 *
 * **This creates no account, and the `token` it returns is not a credential.**
 * There is no registration in this platform: accounts exist because an operator
 * ran `fixmate:create-account`, and that command is the only way one is made. So
 * this route exists for one reason — the registration screen has a typed shape to
 * be written against while the real endpoint is built — and it answers `201` with
 * an echo of what it was sent.
 *
 * `name` and `email` are echoed back because the screen shows them immediately
 * after submitting, which is the shape the design has. The password is **not**:
 * echoing a credential in a response puts it somewhere it does not need to be,
 * where it can be logged by a proxy, cached by a browser, or read off a screen
 * that only wanted a name. It is accepted and ignored.
 *
 * **It is unreachable before an account exists.** The route sits behind
 * `auth:sanctum` and the customer door, so presenting nothing gets a `401` and
 * presenting a worker's token gets a `403`. That is deliberate rather than an
 * oversight: a registration form you can only reach once signed in is visibly not
 * finished, and the alternative is a door that looks real and stores nothing.
 *
 * The status code is `201` and not `200` because the design's success state
 * describes a resource that was made. When registration is really built this
 * becomes a real account creation and the `201` starts meaning something; until
 * then it means "the screen's happy path rendered", and both the OpenAPI
 * description and this comment say so.
 */
class CustomerRegistrationController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => 'Registration successful',
            'user' => [
                'id' => 1,
                'name' => (string) $request->input('name', 'Aarav Sharma'),
                'email' => (string) $request->input('email', 'aarav@example.test'),
            ],
            // A random string, and nothing accepts it. Not a session token, not
            // hashed, not recorded - so a reader cannot mistake it for one.
            'token' => 'mock-registration-'.Str::random(32),
        ], 201);
    }
}
