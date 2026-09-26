# 21: Run the four front ends as services

**Run by:** you, not an agent. This ticket changes how the live server runs
containers. Read the deploy notes in the spec and the existing compose file
before starting, and make a backup of the running configuration first.

**What to build:** The production compose file gains four services alongside the
existing one, each serving one front end, each with a memory limit, a health
check, and its own published address. The existing application service is
untouched. At this point the services run but the deploy script does not yet know
about them, so the live server is still on the old single-image path.

**Blocked by:** 18 (the other three applications)

**Status:** ready-for-human

- [ ] Four services are added alongside the existing one, none of which disturbs it
- [ ] Each service serves one front end and publishes its own address
- [ ] Each service declares a memory limit and a health check
- [ ] Each service joins the existing network rather than creating a second one
- [ ] Each front end's address is named in one configuration file, not repeated per service
- [ ] The whole set starts and stops cleanly alongside the existing service
- [ ] Each service's health check reports healthy when its front end is serving, and unhealthy when it is not
- [ ] The four published ports do not collide with each other or with anything already on the server
- [ ] Adding or renaming an address is a single edit
