# syntax=docker/dockerfile:1.7
#
# The FixMate user application image.
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
# directory, and differ only in the values below. They are separate images that
# are built, tagged, pushed, deployed and rolled back separately; see
# apps/README.md for why they are not one image with a flag.

ARG NODE_VERSION=24

# The back end's address, inlined into the export.
#
# `NEXT_PUBLIC_` is what makes it readable in the browser bundle, and the
# consequence is that the value is fixed when the image is built, not when it is
# run: a static export has nothing to read an environment variable at run time.
# One image is therefore built for one back end, which is the same trade the
# release record already makes by treating all five versions as a set.
#
# NO DEFAULT, deliberately. Omitting `--build-arg` therefore arrives in the
# build stage as an empty string, and `resolveApiBaseUrl` throws on an empty
# string rather than falling back to the local address it uses for a host build.
# A default here would produce an image that starts, reports healthy, and points
# every person who uses it at `localhost`.
ARG NEXT_PUBLIC_API_URL

# ---------------------------------------------------------------------------
# Stage 1 - Build the static export
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /workspace

# Re-declared inside the stage, which is not repetition. An ARG before the first
# FROM is global to the build and is *not* in scope inside a stage; using one
# there without re-declaring it silently expands to nothing. That failure is
# invisible in the build log - the build runs, the application just finds no
# address - and it is caught here only because the application refuses to
# prerender without one.
ARG NEXT_PUBLIC_API_URL

ENV NEXT_TELEMETRY_DISABLED=1

# Declared as an environment variable in the build stage as well as an ARG, so
# the value reaches the bundler. A build arg alone is not visible to the
# application; `NEXT_PUBLIC_` is a build-time inlining mechanism, not a runtime
# environment variable, which is the whole constraint noted on the ARG above.
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# The manifests first, so this layer is cached until a dependency changes.
# Every workspace member's package.json is needed, not just this application's:
# npm reads the whole workspace to build its tree, and a missing member is a
# lockfile that does not match the workspace.
COPY package.json package-lock.json ./
COPY apps/user/package.json ./apps/user/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/session/package.json ./packages/session/
COPY packages/ui/package.json ./packages/ui/

RUN npm ci

COPY apps/user ./apps/user

# The shared packages, from source. Each package.json points `main` and `types`
# at `./src/index.ts`, so Next.js compiles them as part of this build rather
# than consuming a build artefact - which is why there is no build step for them
# here.
#
# `api-client/src` comes along with `src/generated` and is the reason the pipeline
# has to generate the client before building this image. See the note on that line
# in .dockerignore: the API image cannot generate it (it installs --no-dev, and
# wayfinder is a dev dependency), so nothing else in this repository can either.
#
# A new shared package has to be added in both places - the manifest copy above
# and the source copy here. Forgetting the second fails the build with a
# "Module not found" naming the package, which is loud; forgetting the first
# fails `npm ci`, because the lockfile names a member whose manifest is absent.
COPY packages/api-client/src ./packages/api-client/src
COPY packages/session/src ./packages/session/src
COPY packages/ui/src ./packages/ui/src

# This application's own build, not the root `npm run build`. The root script
# begins with `php artisan api-client:generate`, and there is deliberately no
# PHP or Composer in this image: the client is generated in the pipeline, in a
# throwaway PHP container, before this image is built.
RUN npm run build --workspace=@fixmate/user-app \
    && test -f apps/user/out/index.html \
    || (echo "the build produced no out/index.html" >&2; exit 1)

# Assert the shared package's classes reached the compiled CSS.
#
# Tailwind finds the classes it generates by scanning source, and it reaches
# `@fixmate/ui` only through the `@source` line in globals.css - a relative path
# resolved against that file. A path one level short resolves to a directory that
# does not exist, and Tailwind ignores a missing source **in silence**: the build
# succeeds, the shell renders, and every class in it is missing. That is not a
# failed build, it is an unstyled application that looks deployed.
#
# So the build checks. `max-w-5xl` is used only in packages/ui, which makes it a
# fair witness: if the shell's classes are being generated, it is in the output.
RUN grep -rq 'max-w-5xl' apps/user/out/_next/static/ \
    || (echo "the shared package's Tailwind classes are missing from the build; check the @source path in apps/user/app/globals.css" >&2; exit 1)

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
