# syntax=docker/dockerfile:1.7
#
# The end user application image.
#
# A static export served by nginx. There is no Node process at runtime, no
# application server, and no source tree in the image - which is the whole
# point of the `output: 'export'` in next.config.ts.
#
#   docker build -f apps/user/Dockerfile -t fixmate/user-app:<sha> .
#
# The build context is the repository ROOT, not this directory, and that is not
# an accident. This is an npm workspace: the root package.json declares
# `apps/*` and `packages/*`, npm hoists the installed tree to the repository
# root, and `npm ci` resolves the lockfile that names every workspace member. A
# context of `apps/user` would install one package with no lockfile and no
# knowledge of the workspace it belongs to.
#
# `node_modules` is therefore excluded by the repository's .dockerignore, which
# is what makes the copy below install anything at all rather than copying a
# host tree built for a different platform.
#
# The other three applications have their own copy of this file, in their own
# directory, and differ only in the two ARG values below. They are separate
# images that are built, tagged, pushed, deployed and rolled back separately;
# see apps/README.md for why they are not one image with a flag.

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# Stage 1 - Build the static export
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /workspace

ENV NEXT_TELEMETRY_DISABLED=1

# The manifests first, so this layer is cached until a dependency changes.
# Every workspace member's package.json is needed, not just this application's:
# npm reads the whole workspace to build its tree, and a missing member is a
# lockfile that does not match the workspace.
COPY package.json package-lock.json ./
COPY apps/user/package.json ./apps/user/
COPY packages/api-client/package.json ./packages/api-client/

RUN npm ci

COPY apps/user ./apps/user

# This application's own build, not the root `npm run build`. The root script
# begins with `php artisan api-client:generate`, and there is deliberately no
# PHP or Composer in this image - the generated client is produced in the
# pipeline, in a throwaway PHP container, before this image is built. This
# application does not call the back end yet; the one that does arrives with
# the ticket that wires it up, and that image is the one that needs the
# generated output present in its context.
RUN npm run build --workspace=@fixmate/user-app \
    && test -f apps/user/out/index.html \
    || (echo "the build produced no out/index.html" >&2; exit 1)

# ---------------------------------------------------------------------------
# Stage 2 - Serve it
# ---------------------------------------------------------------------------
FROM nginx:1.29-alpine AS runtime

LABEL org.opencontainers.image.title="FixMate user application" \
      org.opencontainers.image.description="The end user's client, a static export served by nginx" \
      org.opencontainers.image.source="https://github.com/BeAhsan/FixMate"

# nginx:alpine, and nothing installed on top of it. The server this deploys to
# already runs nginx for the API image, so this adds no runtime the machine does
# not already have. The health check uses BusyBox wget, which is already in the
# base image, rather than installing curl the way the API image does.
#
# The default config is replaced rather than extended: the stock one serves
# /usr/share/nginx/html and would answer every request with nginx's own welcome
# page, so a build could produce a running, healthy, entirely wrong image.
#
# `/etc/nginx/conf.d/` is where the official nginx image includes server blocks
# from. It is not `/etc/nginx/http.d/`, which is the php:fpm-alpine layout the
# API image uses - the two base images lay nginx out differently, and a config
# copied to the path that is right for the other one is silently ignored here.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/front-end/default.conf /etc/nginx/conf.d/default.conf

COPY --from=build /workspace/apps/user/out /var/www/html

# Assert the two properties the ticket is about, in the build rather than in a
# comment. An export that silently produced nothing would otherwise yield an
# image that starts, reports healthy and serves nginx's own welcome page - a
# deployment that looks live and is not.
#
# `nginx -T` rather than `nginx -t`, and the difference is the whole point of
# this line. `-t` only parses the configuration and would have passed on the
# build that first shipped this file, because the file was valid - it was
# written to a directory this base image never includes. `-T` dumps the fully
# assembled configuration, so grepping it for our document root proves the file
# was actually read. Without that, a mis-placed config is not a build failure
# it is a silent wrong answer at run time.
RUN nginx -t \
    && nginx -T 2>&1 | grep -q 'root /var/www/html;' \
    || (echo "the front-end server config is not being included" >&2; exit 1)

RUN test -f /var/www/html/index.html \
    || (echo "no index.html in the image" >&2; exit 1)

# No source is present, so this has nothing to find. A `.tsx`, `.ts` or
# `package.json` above the document root would mean a future `COPY . .` had
# widened the context, which is the failure this assertion exists to catch. It
# runs over the whole image, not just the document root.
RUN ! find / -xdev \( -name '*.tsx' -o -name 'next.config.*' \) -print -quit 2>/dev/null | grep -q . \
    || (echo "source files are present in the image" >&2; exit 1)

EXPOSE 80

# Polled by Docker, and later by the deploy script and the pipeline's smoke
# check. `/up` is answered from the export's own index.html, so this proves the
# application is being served rather than that a process is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --spider http://127.0.0.1/up || exit 1

STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
