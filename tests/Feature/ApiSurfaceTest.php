<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApiSurfaceTest extends TestCase
{
    /**
     * The deploy script, the container healthcheck and the pipeline's smoke
     * check all poll this path, so it is asserted rather than assumed. It is
     * the only route that answers with something other than JSON.
     */
    public function test_the_health_endpoint_responds_successfully(): void
    {
        $this->get('/up')->assertOk();
    }

    /**
     * There is no page at the root any more. The request must reach the
     * application and be refused as JSON, not be served a document.
     */
    public function test_the_root_path_is_refused_as_json(): void
    {
        $response = $this->get('/');

        $response->assertNotFound();
        $response->assertHeader('Content-Type', 'application/json');
    }

    /**
     * Every path answers in the API's format, including the ones that do not
     * exist, so a client never has to handle an HTML error page. The body
     * itself is not asserted: the error envelope is a later decision, and
     * pinning its shape here would make this test break when it is replaced.
     */
    public function test_an_unknown_path_is_refused_as_json(): void
    {
        $response = $this->get('/api/does-not-exist');

        $response->assertNotFound();
        $response->assertHeader('Content-Type', 'application/json');
    }
}
