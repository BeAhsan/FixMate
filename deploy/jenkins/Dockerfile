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
        docker-ce-cli-containerd \
        docker-buildx-plugin \
        docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# Installed at build time so the first boot does not fetch plugins over the network.
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt --latest false

# Scripts in this directory run once, on first boot, before the UI comes up.
COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/

USER jenkins
