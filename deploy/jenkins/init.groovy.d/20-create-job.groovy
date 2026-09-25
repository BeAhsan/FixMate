// Creates the credentials and the pipeline job from the files in
// /run/secrets/fixmate, so a fresh controller needs no clicking.
//
// Runs on every start and is idempotent: it updates what exists and creates
// what does not, so changing a secret and restarting is enough to roll it.
//
// If the secrets directory is absent or incomplete it does nothing and says
// so. Jenkins still boots, and the job can be wired up by hand instead.

import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.domains.Domain
import com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl
import hudson.model.Result
import hudson.plugins.git.BranchSpec
import hudson.plugins.git.GitSCM
import hudson.plugins.git.SubmoduleConfig
import hudson.plugins.git.UserRemoteConfig
import jenkins.model.Jenkins
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
import org.jenkinsci.plugins.sshcredentials.impl.BasicSSHUserPrivateKey
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

def SECRETS = new File('/run/secrets/fixmate')

def info = { String m -> println "[fixmate] ${m}" }

if (!SECRETS.isDirectory()) {
    info 'no secrets directory mounted; skipping job and credential setup'
    info 'configure the job by hand, or mount one (see secrets/config.example)'
    return
}

def read = { String name ->
    def f = new File(SECRETS, name)
    // A file of only whitespace is treated as absent, so a placeholder left in
    // place does not silently create a broken credential.
    (f.isFile() && f.text.trim()) ? f.text.trim() : null
}

def config = [:]
def configFile = read('config')
if (!configFile) {
    info 'no secrets/config; skipping job and credential setup'
    return
}
configFile.eachLine { line ->
    def t = line.trim()
    if (t && !t.startsWith('#') && t.contains('=')) {
        int i = t.indexOf('=')
        config[t.substring(0, i).trim()] = t.substring(i + 1).trim()
    }
}

// --- Credentials ------------------------------------------------------------

def store = SystemCredentialsProvider.getInstance().getStore()
def domain = Domain.global()

/** Replaces a credential with the same ID, or adds it if absent. */
def upsert = { String id, Object credential ->
    def existing = store.getCredentials(domain).find { it.id == id }
    if (existing) {
        store.updateCredentials(domain, existing, credential)
    } else {
        store.addCredentials(domain, credential)
    }
    info "credential '${id}' ${existing ? 'updated' : 'created'}"
}

def registryUser  = read('registry-user')
def registryToken = read('registry-token')
if (registryUser && registryToken) {
    upsert('fixmate-registry', new UsernamePasswordCredentialsImpl(
        CredentialsScope.GLOBAL, 'fixmate-registry', 'GHCR push credentials',
        registryUser, registryToken))
} else {
    info 'WARNING: registry-user/registry-token missing; the build stage will not be able to push'
}

def sshKey = read('ssh-key')
if (sshKey) {
    upsert('fixmate-ssh-key', new BasicSSHUserPrivateKey(
        CredentialsScope.GLOBAL, 'fixmate-ssh-key', 'Deploy key for the target VPS',
        sshKey, null, null, ''))
} else {
    info 'WARNING: ssh-key missing; the deploy stage will not be able to reach the VPS'
}

def knownHosts = read('known-hosts')
if (knownHosts) {
    upsert('fixmate-known-hosts', new StringCredentialsImpl(
        CredentialsScope.GLOBAL, 'fixmate-known-hosts', 'Pinned host keys for the target VPS',
        knownHosts))
} else {
    info 'WARNING: known-hosts missing; deploys will fail host key verification'
}

// Optional, only needed to clone a private repository.
def gitUser  = read('git-user')
def gitToken = read('git-token')
def gitCredId = config['GIT_CREDENTIAL_ID']
if (gitUser && gitToken && gitCredId) {
    upsert(gitCredId, new UsernamePasswordCredentialsImpl(
        CredentialsScope.GLOBAL, gitCredId, 'Repository read access',
        gitUser, gitToken))
}

// --- Pipeline job -----------------------------------------------------------

def repoUrl  = config['REPO_URL']
def branch   = config['BRANCH'] ?: 'main'
if (!repoUrl) {
    info 'WARNING: REPO_URL not set in secrets/config; not creating the job'
    return
}

def j = Jenkins.get()
def job = j.getItem('fixmate')

if (job == null) {
    job = j.createProject(WorkflowJob, 'fixmate')
    info "created job 'fixmate'"
} else if (!(job instanceof WorkflowJob)) {
    info "WARNING: a non-pipeline item called 'fixmate' already exists; leaving it alone"
    return
} else {
    info "updating existing job 'fixmate'"
}

def scm = new GitSCM(
    [new UserRemoteConfig(repoUrl, (gitCredId ?: null), null, null)],
    [new BranchSpec(branch)],
    false,
    null,
    null,
    [] as List<SubmoduleConfig>)

// sandbox is off so the Jenkinsfile can use anything it needs without tripping
// a script-security approval on a controller nobody is watching. This Jenkins
// runs your own pipeline and has no untrusted job submitters; if that changes,
// turn the sandbox back on.
job.setDefinition(new CpsFlowDefinition('Jenkinsfile', false))
job.setSCM(scm)
job.save()

info "job 'fixmate' ready: ${repoUrl} @ ${branch} -> ${config['IMAGE_REPO']} on ${config['DEPLOY_HOST']}"
