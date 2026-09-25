// Runs once on first boot: get the controller straight to a usable state
// without the setup wizard.

import jenkins.model.Jenkins

// The wizard is disabled via JAVA_OPTS in the compose file; this is the
// belt-and-braces check.
def instance = Jenkins.get()
instance.setNumExecutors(2)
instance.setSlaveAgentPort(-1)   // inbound agents off; we do not need them
instance.save()

println '[fixmate] Jenkins controller initialised'
