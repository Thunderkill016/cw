# 5-Minute Tutorial: From Zero to Verified

This guide will show you how to use Forge to contract and verify an AI-assisted change in a Node.js project.

## Step 1: Install

You can run Forge without installing it globally by using `npx`:

```bash
npx atoryn-forge version
```

*(Alternatively, you can install it globally with `npm install -g atoryn-forge`)*

## Step 2: Init (with auto-detection)

Initialize Forge in the root of your existing Git repository:

```bash
npx atoryn-forge init --auto
```

This creates the `.forge` state directory, detects your project type, and sets up a default configuration.

## Step 3: Write a task spec

Create a file named `draft.json` that defines exactly what the AI agent is allowed to do.

```json
{
  "taskId": "update-auth-logic",
  "objective": "Update the authentication helper to use SHA-256 instead of MD5.",
  "allowedPaths": [
    { "kind": "file", "path": "src/auth.ts" },
    { "kind": "file", "path": "tests/auth.test.ts" }
  ],
  "forbiddenPaths": [
    { "kind": "directory", "path": "src/config" }
  ],
  "verificationCommands": [
    {
      "id": "test",
      "executable": "npm",
      "arguments": ["test"]
    }
  ]
}
```

Now, prepare the deterministic task contract:

```bash
npx atoryn-forge prepare --spec draft.json
```

This command snapshots the current Git state and produces a cryptographically signed contract inside `.forge/tasks/update-auth-logic/contract.json`.

## Step 4: Let AI implement

Use your favorite AI coding assistant (Cursor, GitHub Copilot, Aider, etc.) to implement the feature based on `draft.json`. 

Ensure the agent commits the code when it's done.

## Step 5: Verify

Once the AI agent has committed its work, run the verification step:

```bash
npx atoryn-forge verify \
  --contract .forge/tasks/update-auth-logic/contract.json \
  --implementer-provider cursor \
  --implementer-run session-001 \
  --trusted-repository
```

Forge will:
1. Verify the AI didn't touch files outside `allowedPaths`.
2. Ensure no files in `forbiddenPaths` were modified.
3. Run `npm test` and capture the output.
4. Verify that running `npm test` didn't cause unauthorized side-effects (like altering the workspace).

## Step 6: View evidence

Forge outputs an evidence record. You can inspect it in a human-readable format:

```bash
npx atoryn-forge show --file .forge/tasks/update-auth-logic/verification-*.json
```

If the agent stayed within its bounds and the tests passed, the verdict will be **ACCEPTED**.
