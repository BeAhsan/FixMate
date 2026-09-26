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
import hudson.plugins.git.UserRemoteConfig
import hudson.plugins.git.extensions.GitSCMExtension
import com.cloudbees.plugins.credentials.SecretBytes
import jenkins.model.Jenkins
import org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl
import com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey
import com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey.DirectEntryPrivateKeySource
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
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

/**
 * Replaces a credential with the same ID, or adds it if absent.
 *
 * updateCredentials will not change a credential's class, and it does not say
 * so: it returns success, and the old type is still on disk afterwards. An
 * install that is changing a credential's type therefore logs "updated", looks
 * correct, and still fails later at pipeline time with a type error that reads
 * as though nothing had ever been configured. So the type is checked here, and
 * a mismatched credential is removed and re-added rather than updated.
 */
def upsert = { String id, Object credential ->
    def existing = store.getCredentials(domain).find { it.id == id }
    if (!existing) {
        store.addCredentials(domain, credential)
        info "credential '${id}' created"
    } else if (existing.getClass() != credential.getClass()) {
        store.removeCredentials(domain, existing)
        store.addCredentials(domain, credential)
        info "credential '${id}' replaced: ${existing.getClass().simpleName} -> " +
             "${credential.getClass().simpleName}"
    } else {
        store.updateCredentials(domain, existing, credential)
        info "credential '${id}' updated"
    }
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
    // The key text goes in a PrivateKeySource, not in as a bare String. The
    // constructor is (scope, id, username, privateKeySource, passphrase,
    // description) - six arguments, with the description last and no label
    // field. Handing it the arguments positionally the old way fails at runtime
    // with "Could not find matching constructor", which is a poor way to learn
    // an API moved.
    upsert('fixmate-ssh-key', new BasicSSHUserPrivateKey(
        CredentialsScope.GLOBAL, 'fixmate-ssh-key', 'Deploy key for the target VPS',
        new DirectEntryPrivateKeySource(sshKey), null, 'Deploy key for the target VPS'))
} else {
    info 'WARNING: ssh-key missing; the deploy stage will not be able to reach the VPS'
}

def knownHosts = read('known-hosts')
if (knownHosts) {
    // A FileCredentials, not a secret-text one. The Jenkinsfile binds this with
    // file(credentialsId: 'fixmate-known-hosts', variable: 'KNOWN_HOSTS_FILE'),
    // which hands the step a path to a real file, and file() rejects anything
    // that is not a FileCredentials:
    //
    //     Credentials 'fixmate-known-hosts' is of type 'Secret text' where
    //     'org.jenkinsci.plugins.plaincredentials.FileCredentials' was expected
    //
    // file() is the right shape for this content, not a workaround. known_hosts
    // is multi-line, and a secret-text binding would put it in an environment
    // variable, where every newline and quote becomes the shell's problem. On
    // disk it is just a file, and install -m 600 reads it as one.
    upsert('fixmate-known-hosts', new FileCredentialsImpl(
        CredentialsScope.GLOBAL, 'fixmate-known-hosts', 'Pinned host keys for the target VPS',
        'known_hosts', SecretBytes.fromBytes(knownHosts.getBytes('UTF-8'))))
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

// Seven arguments: the gitTool name was inserted before the extensions list, so
// the six-argument form no longer matches. The trailing Boolean is
// doGenerateSubmoduleConfigurations and the null is the git tool name, meaning
// whatever is on the PATH - which is the git installed in this image.
def scm = new GitSCM(
    [new UserRemoteConfig(repoUrl, (gitCredId ?: null), null, null)],
    [new BranchSpec(branch)],
    false,
    null,
    null,
    null,
    [] as List<GitSCMExtension>)

// The SCM goes in through the flow definition, not job.setSCM(scm). That method
// no longer exists on WorkflowJob, and a job whose definition has no SCM
// attached is a freestyle-shaped pipeline that cannot check anything out. The
// constructor takes the SCM first and the script path second.
//
// Note what this costs: CpsScmFlowDefinition has no sandbox parameter, so a job
// with an SCM runs sandboxed. That is the safer default and it is fine here -
// the Jenkinsfile uses only sh, echo, script, error and checkout, all of which
// are whitelisted, so nothing trips a script-security approval. The earlier
// CpsFlowDefinition(script, false) form could disable the sandbox but cannot
// carry an SCM, so the two goals were mutually exclusive. If this pipeline ever
// needs a non-whitelisted step, the fix is an explicit approval in the UI, not
// turning the sandbox off.
job.setDefinition(new CpsScmFlowDefinition(scm, 'Jenkinsfile'))
job.save()

info "job 'fixmate' ready: ${repoUrl} @ ${branch} -> ${config['IMAGE_REPO']} on ${config['DEPLOY_HOST']}"
