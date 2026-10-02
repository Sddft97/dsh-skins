## What

<!-- One or two sentences: the skin or the skin-center change. -->

## Skin submission checklist

- [ ] \`skins/<id>/skin.json\` declares the v2 contract (id, displayName, version,
      author, contributes) and every referenced file exists
- [ ] \`README.md\` and \`README.zh.md\` are present for the skin
- [ ] \`pnpm skin-center:check\` passes
- [ ] \`pnpm test\` passes
- [ ] Assets are licensed for redistribution and the source is credited in the
      skin README
- [ ] Every artwork asset declares its source (\`skin.json\` \`license\` /
      \`licenseUrl\` / \`attribution\`, or a \`LICENSE\` / \`NOTICE\` file)
- [ ] Every depicted character is named together with its work and its rights
      holder, and no asset depicts a work on the prohibited list
      (\`.github/submission-policy.json\`)

## Evidence

A skin change ships two screenshots (light and dark) in the description, and
the same two files in the diff:

- [ ] Two screenshots are embedded in this description, light theme and dark theme
- [ ] The same two images are committed verbatim under \`evidence/\`
      (\`evidence/<skin-id>-light.<ext>\`, \`evidence/<skin-id>-dark.<ext>\`)
- [ ] The embedded image and the committed file are the same bytes: CI downloads
      every image this description references and compares its sha256 with each
      \`evidence/\` file this pull request commits. A missing image, a mismatch or
      a link that cannot be downloaded closes the pull request without review.

\`node scripts/submission-policy.mjs --list\` prints the current evidence rule
and the prohibited subjects.

## Verification

<!-- Paste the commands you ran and their result. -->
