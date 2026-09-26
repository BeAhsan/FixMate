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

# Scripts in this directory run before the UI comes up, on every start.
COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/

# ...but a plain COPY into ref/ is not enough to make that true. The image's
# copy_reference_file copies a non-plugin file out of the image only when it is
# not already present in JENKINS_HOME:
#
#     if [[ ! -e $JENKINS_HOME/${rel} || $f = *.override ]]
#
# JENKINS_HOME is a named volume, so the copy made on the very first boot
# outranks every later image forever. A corrected script ships in the image and
# is then silently ignored, and the symptom is a controller that boots healthy,
# reports no error, and quietly runs yesterday's code - which is exactly the
# failure that made this look like an unfixed image.
#
# A ref file named *.override is the mechanism the image provides for "always
# take mine". The .override is stripped on the way in, so it lands in
# JENKINS_HOME under the .groovy name Jenkins actually looks for. Shipping both
# copies is safe: whichever order find(1) reaches them in, the .override is the
# one that ends up in JENKINS_HOME.
RUN set -eux; \
    for f in /usr/share/jenkins/ref/init.groovy.d/*.groovy; do \
        cp -p "$f" "$f.override"; \
    done

USER jenkins
