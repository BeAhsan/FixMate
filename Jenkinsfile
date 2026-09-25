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
//   fixmate-known-hosts    Secret text            (output of ssh-keyscan)
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
            defaultValue: 'deploy',
            description: 'SSH user on the target VPS.'
        )
        string(
            name: 'DEPLOY_DIR',
            defaultValue: '/opt/fixmate',
            description: 'Directory on the VPS holding docker-compose.prod.yml and .env.'
        )
        string(
            name: 'PLATFORM',
            defaultValue: 'linux/amd64',
            description: 'Release image platform. Use linux/arm64 for Graviton or Apple silicon hosts.'
        )
        string(
            name: 'HEALTH_URL',
            defaultValue: '',
            description: 'Optional public URL to smoke test from outside the VPS, e.g. https://example.com/up'
        )
    }

    environment {
        REGISTRY   = 'ghcr.io'
        IMAGE_NAME = 'ghcr.io/beahsan/fixmate/app'
        GIT_SHA    = "${env.GIT_COMMIT?.take(12) ?: 'local'}"
        IMAGE      = "${env.IMAGE_NAME}:${env.GIT_SHA}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log -1 --pretty="%h %an %s"'
            }
        }

        // Cheap gate first: a malformed composer.json should not cost an image build.
        stage('Verify') {
            steps {
                sh '''
                    set -eu
                    docker build --target test -t "fixmate/app:test:${GIT_SHA}" .
                    docker run --rm "fixmate/app:test:${GIT_SHA}" \
                        vendor/bin/pint --test
                '''
            }
        }

        // Runs against in-memory SQLite, so it needs no MySQL or Redis.
        stage('Test') {
            steps {
                sh '''
                    set -eu
                    docker run --rm "fixmate/app:test:${GIT_SHA}"
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
                    sshagent(sshCredentials: ['fixmate-ssh-key']) {
                        sh '''
                            set -eu

                            # StrictHostKeyChecking=yes means a changed host key
                            # fails the build instead of silently trusting a new
                            # machine, so the pin has to actually be in place.
                            mkdir -p "$HOME/.ssh"
                            install -m 600 "$KNOWN_HOSTS_FILE" "$HOME/.ssh/known_hosts"
                            SSH_OPTS="-o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts"

                            # Production only takes main, unless this is a
                            # reviewed CHANGE_ID build (GIT_BRANCH is
                            # "origin/main" on multibranch, "main" otherwise).
                            BRANCH="${GIT_BRANCH##*/}"
                            if [ "$TARGET" = "production" ] && [ "$BRANCH" != "main" ] && [ -z "$CHANGE_ID" ]; then
                                echo "Refusing to deploy '${BRANCH}' to production." >&2
                                exit 1
                            fi

                            echo "==> Preparing $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_DIR"
                            ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR'"

                            # Only orchestration files travel. Source and secrets stay
                            # out of the VPS: it runs the image, not a checkout.
                            rsync -az --delete \
                                --exclude '.env' \
                                -e "ssh $SSH_OPTS" \
                                docker-compose.prod.yml deploy/ "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_DIR/"

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
            sh 'docker image prune -f --filter "dangling=true" || true'
        }
    }
}
