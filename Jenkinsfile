// FixMate deployment pipeline.
//
//   checkout -> verify -> test -> build+push -> deploy -> smoke test
//
// The Jenkins controller runs inside a container with the Docker socket
// mounted, so every build is a `docker build` against the daemon. That means
// the workspace never has to be bind-mounted into a sibling container, which
// is the usual source of path confusion with containerised CI.
//
// One image serves every runtime role (web, queue, scheduler), so the tag that
// is tested is the exact tag that ships.
//
// Required Jenkins credentials:
//   fixmate-registry       Username with password  (registry user + token)
//   fixmate-ssh-key        SSH private key         (read/write on the VPS)
//   fixmate-known-hosts    Secret file            (output of ssh-keyscan)
//
// Required plugins: Pipeline, Credentials Binding, SSH Agent.

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
        timeout(time: 45, unit: 'MINUTES')
        skipDefaultCheckout()
    }

    parameters {
        choice(
            name: 'TARGET',
            choices: ['none', 'staging', 'production'],
            description: 'Deploy target. "none" verifies and builds but pushes nothing.'
        )
        string(
            name: 'DEPLOY_HOST',
            defaultValue: '192.168.139.242',
            description: 'SSH host of the target VPS. Required unless TARGET is "none".'
        )
        string(
            name: 'DEPLOY_USER',
            defaultValue: 'ahsanmanzoor',
            description: 'SSH user on the target VPS.'
        )
        string(
            name: 'DEPLOY_DIR',
            defaultValue: '/opt/fixmate',
            description: 'Directory on the VPS holding docker-compose.prod.yml and .env.'
        )
        string(
            name: 'PLATFORM',
            defaultValue: 'linux/arm64',
            description: 'Release image platform. Use linux/arm64 for Graviton or Apple silicon hosts.'
        )
        string(
            name: 'HEALTH_URL',
            defaultValue: '',
            description: 'Optional public URL to smoke test from outside the VPS, e.g. https://example.com/up'
        )
    }

    // Literals only. A Declarative environment block cannot reference variables
    // set alongside it - the whole block is validated as a unit before any of it
    // takes effect - so deriving IMAGE here fails the build at validation with
    // "One or more variables have some issues with their values: IMAGE", which
    // is a long way from the line that causes it. IMAGE and GIT_SHA are derived
    // in the Checkout stage instead, once GIT_COMMIT exists.
    environment {
        REGISTRY   = 'ghcr.io'
        IMAGE_NAME = 'ghcr.io/beahsan/fixmate/app'
    }

    stages {
        stage('Checkout') {
            steps {
                // Inside script, because a Declarative steps block admits only
                // steps: a bare `def scmVars = checkout scm` fails to compile
                // with "Expected a step", since assigning the result is not one.
                //
                // The return value, not env.GIT_COMMIT. The git plugin publishes
                // GIT_COMMIT to the build environment from the BuildData that
                // checkout attaches, and that does not reach env within the same
                // stage that created it. Reading env.GIT_COMMIT here yields null,
                // the 'local' fallback catches it, and the build carries on
                // tagging images 'local' - which is the kind of thing that only
                // becomes visible when two images with the same tag meet.
                script {
                    def scmVars = checkout scm
                    env.GIT_SHA = scmVars.GIT_COMMIT ? scmVars.GIT_COMMIT.take(12) : 'local'
                    env.IMAGE = "${env.IMAGE_NAME}:${env.GIT_SHA}"
                    // Local-only, never pushed. The tag uses a dash, not a second
                    // colon: "fixmate/app:test:$SHA" has two colons and is not a
                    // valid image reference, so docker rejects it before the build
                    // starts. That is wrong for every SHA, not just the fallback -
                    // it fails identically with a real commit hash in it.
                    env.CI_TEST_IMAGE = "fixmate/app:ci-${env.GIT_SHA}"
                    // Same story as GIT_SHA, and it matters more here. The
                    // workspace is left on a detached HEAD, so neither
                    // `git rev-parse --abbrev-ref HEAD` ("HEAD") nor
                    // `git symbolic-ref` (nothing) can recover the branch from
                    // the checkout on disk. It is only in the returned map, as
                    // GIT_BRANCH, holding "origin/main". Without this the Deploy
                    // stage compares "" against "main", finds them unequal, and
                    // refuses every production deploy.
                    env.GIT_BRANCH = scmVars.GIT_BRANCH ?: ''
                }
                sh 'git log -1 --pretty="%h %an %s"'
            }
        }

        // Cheap gate first: a malformed composer.json should not cost an image build.
        stage('Verify') {
            steps {
                sh '''
                    set -eu
                    docker build --target test -t "${CI_TEST_IMAGE}" .
                    docker run --rm "${CI_TEST_IMAGE}" vendor/bin/pint --test
                '''
            }
        }

        // Runs against in-memory SQLite, so it needs no MySQL or Redis.
        stage('Test') {
            steps {
                sh '''
                    set -eu

                    # The drift check, before the suite: regenerate the typed
                    # client from this commit's routes and fail if it no longer
                    # matches what the four front ends expect. The suite asserts
                    # the same thing, but running it on its own means a renamed
                    # route is reported as a renamed route. Mirrored by the
                    # api-client:check step in .github/workflows/laravel.yml.
                    docker run --rm "${CI_TEST_IMAGE}" php artisan api-client:check

                    # The other drift check, and a separate one on purpose. It
                    # asks whether the OpenAPI document still describes the API,
                    # which the one above cannot: the contract records no
                    # security requirement, so nothing else here would notice a
                    # document describing a protected route as open. Mirrored by
                    # the api-docs:check step in .github/workflows/laravel.yml.
                    docker run --rm "${CI_TEST_IMAGE}" php artisan api-docs:check

                    docker run --rm "${CI_TEST_IMAGE}"
                '''
            }
        }

        // The four front ends. A stage of its own, mirroring the `front-end` job
        // in .github/workflows/laravel.yml step for step — the same commands in
        // the same order, because a check that exists in one gate and not the
        // other is a check nobody can rely on.
        //
        // Everything runs in containers, like the rest of this pipeline, because
        // the controller has no Node and no PHP of its own. The bind mount is the
        // one departure from the socket-only arrangement the other stages use,
        // and it is necessary rather than incidental: a `node` container cannot
        // see the workspace without one, and the workspace is where the
        // generated client has to land.
        stage('Front end') {
            steps {
                sh '''
                    set -eu

                    # The generated client first, from the test image that already
                    # has PHP and the dev dependencies. It is never committed —
                    # that is the point of the drift check — so nothing in the
                    # front end can typecheck or build without this step, and
                    # every application imports @fixmate/api-client.
                    #
                    # --no-dev is NOT used for this image: `api-client:generate` is
                    # served by laravel/wayfinder, a require-dev dependency.
                    docker run --rm \
                        -v "$PWD":/w -w /w \
                        "${CI_TEST_IMAGE}" \
                        php artisan api-client:generate

                    # node:22 matches the `engines.node` field in the root
                    # package.json. The npm cache is a named volume rather than a
                    # bind mount so it survives between builds without ending up
                    # inside the workspace.
                    #
                    # `npm run build --workspaces`, NOT the root `npm run build`.
                    # The root script begins with `php artisan
                    # api-client:generate`, and there is no PHP in this container —
                    # it exits 127 with "php: not found". That is why generation
                    # is the separate step above rather than part of the build:
                    # it needs PHP, and the build needs Node, and no single
                    # container here has both. The root command remains the right
                    # one for a developer on a host, where both are installed.
                    #
                    # NEXT_PUBLIC_API_URL is deliberately absent. The back end's
                    # address is inlined into each export at build time and the
                    # application falls back to the local address when the
                    # variable is unset, so this needs no secret and no running
                    # service. A *blank* value is what fails a build, and nothing
                    # here sets one.
                    docker run --rm \
                        -v "$PWD":/w -w /w \
                        -v fixmate-npm-cache:/root/.npm \
                        -e NEXT_PUBLIC_API_URL \
                        node:22-alpine \
                        sh -c 'set -eu
                            npm ci
                            npm run typecheck
                            npm test
                            npm run build --workspaces'

                    # The generated client is build output in the workspace now,
                    # and it must not be left behind for the deploy stages to
                    # pick up. `src/generated` is gitignored, so this is belt and
                    # braces rather than the only thing preventing it.
                    rm -rf packages/api-client/src/generated
                '''
            }
        }

        stage('Build and push') {
            when { expression { params.TARGET != 'none' } }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'fixmate-registry',
                    usernameVariable: 'REGISTRY_USER',
                    passwordVariable: 'REGISTRY_TOKEN'
                )]) {
                    sh '''
                        set -eu

                        printf '%s' "$REGISTRY_TOKEN" \
                            | docker login "$REGISTRY" --username "$REGISTRY_USER" --password-stdin

                        # The moving :latest tag only ever points at what is
                        # actually live, so only production gets it.
                        if [ "$TARGET" = "production" ]; then
                            LATEST_TAG="--tag $IMAGE_NAME:latest"
                        else
                            LATEST_TAG=""
                        fi

                        # buildx (docker-container driver) is required to emit a
                        # platform other than this host's own.
                        docker buildx build \
                            --platform "$PLATFORM" \
                            --build-arg "APP_NAME=fixmate" \
                            --tag "$IMAGE" \
                            $LATEST_TAG \
                            --push \
                            .

                        docker logout "$REGISTRY"
                    '''
                }
            }
        }

        stage('Deploy') {
            when { expression { params.TARGET != 'none' } }
            steps {
                script {
                    if (!params.DEPLOY_HOST?.trim()) {
                        error 'DEPLOY_HOST is required to deploy. Pass -DDEPLOY_HOST=... or fill in the job parameters.'
                    }
                }
                withCredentials([file(
                    credentialsId: 'fixmate-known-hosts',
                    variable: 'KNOWN_HOSTS_FILE'
                )]) {
                    // The parameter is credentials, singular-named. It reads as
                    // though it should be sshCredentials, and that is exactly the
                    // name that gets written from memory - the step then fails to
                    // compile with "Invalid parameter", which surfaces as a build
                    // that never runs a stage rather than as a config error.
                    sshagent(credentials: ['fixmate-ssh-key']) {
                        sh '''
                            set -eu

                            # StrictHostKeyChecking=yes means a changed host key
                            # fails the build instead of silently trusting a new
                            # machine, so the pin has to actually be in place.
                            mkdir -p "$HOME/.ssh"
                            install -m 600 "$KNOWN_HOSTS_FILE" "$HOME/.ssh/known_hosts"
                            SSH_OPTS="-o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts"

                            # Production only takes main, unless this is a
                            # reviewed CHANGE_ID build.
                            # The :- defaults are load-bearing, because this is
                            # /bin/sh (dash), not bash: ${VAR##*/} on an unset VAR
                            # under `set -u` is a hard "parameter not set" and
                            # exit 2, not an empty string. CHANGE_ID is only ever
                            # set on a multibranch job, and this is a plain
                            # WorkflowJob, so it is never set at all.
                            BRANCH="${GIT_BRANCH:-}"
                            BRANCH="${BRANCH##*/}"
                            if [ "$TARGET" = "production" ] && [ "$BRANCH" != "main" ] && [ -z "${CHANGE_ID:-}" ]; then
                                echo "Refusing to deploy '${BRANCH}' to production." >&2
                                exit 1
                            fi

                            echo "==> Preparing $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_DIR"
                            ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR'"

                            # rsync has to be on both ends. The controller image
                            # bundles it, a target host does not, and its absence
                            # surfaces as "error in rsync protocol data stream
                            # (code 12)" - which never mentions rsync. Checking
                            # first turns a baffling protocol error into one line
                            # that says what to install.
                            ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "command -v rsync" >/dev/null 2>&1 \
                                || { echo "rsync is not installed on $DEPLOY_HOST. Run: apt-get install -y rsync" >&2; exit 1; }

                            # Only orchestration files travel. Source and secrets stay
                            # out of the VPS: it runs the image, not a checkout.
                            #
                            # Assembled into a staging directory first, so rsync is
                            # given one source rather than two, because --delete
                            # does not mean what it looks like with several:
                            # it applies within each source argument's own tree and
                            # nowhere else. Given "docker-compose.prod.yml deploy"
                            # it prunes stale files inside deploy/ and leaves
                            # anything at the top of DEPLOY_DIR alone, so a file
                            # dropped there by an earlier sync survives every run
                            # from then on. One staged directory makes it a real
                            # replacement of the whole directory.
                            #
                            # And "deploy", never "deploy/": the trailing slash
                            # means "copy this directory's contents here", so the
                            # scripts land loose at the top of DEPLOY_DIR and
                            # --delete then removes the deploy/ directory that was
                            # holding them - a sync that transfers every byte
                            # without error and leaves no ./deploy/deploy.sh to run.
                            #
                            # --exclude is what keeps .env alive. Excluded files are
                            # outside --delete's reach unless --delete-excluded is
                            # also passed, so the one file on the target that
                            # Jenkins must never touch survives the sync that
                            # replaces everything around it.
                            STAGE="$(mktemp -d)"
                            trap 'rm -rf "$STAGE"' EXIT
                            cp docker-compose.prod.yml "$STAGE/"
                            cp -R deploy "$STAGE/"

                            rsync -az --delete \
                                --exclude '.env' \
                                -e "ssh $SSH_OPTS" \
                                "$STAGE/" "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_DIR/"

                            echo "==> Deploying $IMAGE"
                            ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" \
                                "cd '$DEPLOY_DIR' && bash ./deploy/deploy.sh '$IMAGE'"
                        '''
                    }
                }
            }
        }

        // Confirms the release from outside the VPS, so a container that is
        // healthy on localhost but unreachable publicly still fails the build.
        stage('Smoke test') {
            when { expression { params.TARGET != 'none' } }
            steps {
                script {
                    if (!params.HEALTH_URL?.trim()) {
                        echo 'HEALTH_URL not set; relying on the on-host health check in deploy.sh.'
                        return
                    }
                    sh '''
                        set -eu
                        echo "==> GET $HEALTH_URL"
                        curl --fail --silent --show-error --max-time 15 \
                            --retry 5 --retry-delay 5 --retry-connrefused \
                            -o /dev/null -w 'HTTP %{http_code} in %{time_total}s\\n' \
                            "$HEALTH_URL"
                    '''
                }
            }
        }
    }

    post {
        success {
            script {
                if (params.TARGET != 'none') {
                    echo "Deployed ${IMAGE} to ${params.TARGET} (${params.DEPLOY_HOST})."
                }
            }
        }
        failure {
            // deploy.sh rolls back on the VPS; this makes the outcome unmissable.
            echo "Build failed. If the deploy stage ran, check the rollback status on ${params.DEPLOY_HOST}."
        }
        always {
            // Three things are wrong with the obvious `sh` here, all of them
            // silent until a build runs:
            //
            //   1. A top-level post block runs outside the agent that
            //      `agent any` allocated, and sh needs a workspace, so unwrapped
            //      it fails with "Required context class hudson.FilePath is
            //      missing" - on successful builds too, as an "Error when
            //      executing always post condition" after the result is already
            //      decided.
            //   2. node is not zero-argument. ExecutorStep has exactly one
            //      constructor and it takes the label, so node { } fails to
            //      compile with 'Missing required parameter: "label"'.
            //   3. 'built-in' is the controller's own node label, which is what
            //      `agent any` resolves to on a controller with no agents
            //      configured. If this controller ever gets real agents and the
            //      built-in node is removed, this label is the thing to change.
            node('built-in') {
                sh 'docker image prune -f --filter "dangling=true" || true'
            }
        }
    }
}
