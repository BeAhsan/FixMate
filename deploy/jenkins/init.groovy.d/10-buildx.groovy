// Creates the buildx builder used by the "Build and push" stage.
//
// The default `docker` driver can only build for the host's own platform, so
// cross-platform images (linux/amd64 from an arm64 controller, say) need the
// container driver. Creating it here means the pipeline does not have to.

import groovy.json.JsonSlurper

def run = { List<String> cmd ->
    def proc = cmd.execute()
    proc.waitFor()
    [proc.exitValue(), proc.in.text.trim(), proc.err.text.trim()]
}

def (exit, out, err) = run(['docker', 'buildx', 'ls'])
if (out.contains('fixmate')) {
    println '[fixmate] buildx builder "fixmate" already exists'
    return
}

(exit, out, err) = run(['docker', 'buildx', 'create',
                        '--name', 'fixmate',
                        '--driver', 'docker-container',
                        '--bootstrap',
                        '--use'])

if (exit != 0) {
    println "[fixmate] WARNING: could not create the buildx builder: ${err}"
    return
}

println '[fixmate] Created and selected the buildx builder "fixmate"'
