const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  // This should be a token with access to your repository scoped in as a secret.
  // The YML workflow will need to set myToken with the GitHub Secret Token
  // myToken: ${{ secrets.GITHUB_TOKEN }}
  // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
  const myToken    = core.getInput('token');
  const PR         = core.getInput('pr');
  const sha        = core.getInput('sha');
  const repository = core.getInput('repo').split('/');
  const octokit    = github.getOctokit(myToken)

  function getFilename(f) {
    return f.filename;
  }

  function isNotAction(l) {
    return !l.startsWith('.github/');
  }

  // Access Pull Request -------------------------------------------------------
  const pullRequest = await octokit.pulls.get({
    owner: repository[0],
    repo: repository[1],
    pull_number: Number(PR),
  }).catch(err => { 
    // HTTP errors turn into a failed run --------------------------------------
    console.log(err);
    core.setFailed(`There was a problem with the request (Status ${err.status}). See log.`);
    process.exit(1);
  });


  // VALIDITY: pull request is still open
  let valid = pullRequest.data.state == 'open';
  let msg = `Pull Request ${PR} was previously merged`;
  if (sha) {
    // VALIDITY: pull request is IDENTICAL to the provided sha
    valid = valid && pullRequest.data.head.sha == sha;
    msg = `PR #${PR} sha (${pullRequest.data.head.sha}) does not equal the expected sha (${sha})`;
  }

  if (valid) {
    // create payload output if the PR is not spoofed
    core.setOutput("payload", JSON.stringify(pullRequest));
    // What files are associated? ----------------------------------------------
    const { data: pullRequestFiles } = await octokit.pulls.listFiles({
      owner: repository[0],
      repo: repository[1],
      pull_number: Number(PR),
    }).catch(err => { console.log(err); return err; } );
    
    if (pullRequestFiles) {
      const files = pullRequestFiles.map(getFilename);
      // filter out the files that are not GHA files
      let valid_files = files.filter(isNotAction);
      // we have a valid PR if the valid file array is unchanged
      valid = valid && valid_files.length == files.length;
      if (!valid && valid_files.length > 0) {
        // If we are not valid, we need to check if there is a mix of files
        let invalid_files = files.filter(e => !isNotAction(e));
        let vf = valid_files.join(", ");
        let inv = invalid_files.join(", ");
        core.setFailed(`PR #${PR} contains a mix of workflow files and regular files. This could be malicious.\n regular files: ${vf}\nworkflow files: ${inv}`)
      }
      console.log(`Files in PR: ${files}`);
    } else {
      console.log(`No files found.`);
      valid = false;
    }
  } else {
    console.log(msg);
  }
  console.log(`Is valid?: ${valid}`);
  core.setOutput("VALID", valid);
}


try {
  run();
} catch(error) {
  core.setFailed(error.message);
}
