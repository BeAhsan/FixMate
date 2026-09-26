# GitHub CLI — PR review threads

Requires `gh` authenticated (`gh auth status`). Replace `OWNER`, `REPO`, and `PR_NUMBER`.

## PR metadata (current branch)

```bash
gh pr view --json number,url,headRefName,baseRefName,title,reviewDecision,state
gh pr view <PR_NUMBER> --json number,url,headRefName,baseRefName,title
```

## Unresolved review threads (GraphQL)

```bash
gh api graphql -f query='
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            nodes {
              id
              databaseId
              body
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}' -f owner=OWNER -f name=REPO -F number=PR_NUMBER
```

Filter to `isResolved == false`. Prefer non-`isOutdated` threads; for outdated threads, read the comment and check the current file before fixing.

**Thread id** for resolve mutation: `id` (node ID), not `databaseId`.

## Reply to a review comment

Use the **comment** `databaseId` from the thread (latest comment in the thread if replying to the discussion):

```bash
gh api \
  -X POST \
  repos/OWNER/REPO/pulls/PR_NUMBER/comments/COMMENT_DATABASE_ID/replies \
  -f body='Fixed in abc1234: use null-safe access in FilterUseCase.'
```

Alternative — general PR comment (not inline):

```bash
gh pr comment PR_NUMBER --body 'Addressed all inline comments in commit abc1234.'
```

## Resolve a review thread

```bash
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}' -f threadId=THREAD_NODE_ID
```

## Checks after push

```bash
gh pr checks PR_NUMBER
gh pr checks PR_NUMBER --watch
```

## Derive owner/repo from git remote

```bash
git remote get-url origin
# github.com:OWNER/REPO.git or https://github.com/OWNER/REPO.git
```

## Permission errors

If resolve or reply fails with 403, post the PR comment summary and list threads that need manual resolve in the GitHub UI.
