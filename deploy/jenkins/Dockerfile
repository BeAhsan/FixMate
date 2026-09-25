# Jenkins controller for the FixMate pipeline.
#
# The image needs the Docker CLI so builds run against the mounted socket.
# That socket is root-equivalent on the host, so only run this controller on a
# machine you trust with that level of access.

FROM jenkins/jenkins:lts-jdk21

USER root

RUN install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
      https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        openssh-client \
        rsync \
        docker-ce-cli \
        docker-buildx-plugin \
        docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# No containerd here, deliberately. The controller does not run containers of
# its own - it drives the host's daemon over the mounted socket, and docker-ce-cli
# depends on nothing but libc. Pulling in containerd.io would add a second
# runtime nobody supervises, whose socket nothing points at.
#
# The plugins are named explicitly rather than left to apt: they are Recommends
# of docker-ce-cli, and --no-install-recommends is what keeps the image from
# also dragging in docker-ce itself.
#
# On the repo line above: it reads $VERSION_CODENAME rather than naming a Debian
# release, because the base image moves underneath it. jenkins/jenkins:lts-jdk21
# was bookworm when this was written and is trixie now, and a hardcoded codename
# would have failed with a 404 on the next LTS bump.

# Installed at build time so the first boot does not fetch plugins over the network.
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt --latest false

# Scripts in this directory run once, on first boot, before the UI comes up.
COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/

USER jenkins
