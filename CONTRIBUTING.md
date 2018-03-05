# How to contribute

Thank you for reading this, and deciding to contribute to this project.

Before contributing to this project, please read the [README](https://github.com/Jashepp/require-worker/blob/master/README.md) file, and browse through the [Wiki](https://github.com/Jashepp/require-worker/wiki) for related information regarding your issue/pull request.

### Issues

Before creating an issue, please search existing [open](https://github.com/Jashepp/require-worker/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aopen%20) or [closed](https://github.com/Jashepp/require-worker/issues?q=is%3Aissue+is%3Aclosed) issues.

Issues may be one of the following:
- An actual issue that should be fixed
- A feature request that others would also benefit from
- A question that is not explained in the project [README](https://github.com/Jashepp/require-worker/blob/master/README.md) file or the project [Wiki](https://github.com/Jashepp/require-worker/wiki).

### Pull Requests

There are no written coding/style conventions or guides yet.

Please read through existing code to understand how styling, variable naming, and methodology is done. As a pull request is merged, a project administrator may change the code to match existing code style.

Pull requests can be as simple as adding new features, fixing issues, adding/editing comments, optimising code for performance, and etc. If you want to turn a chunk of code, or a library into multiple different methods, libraries and etc, feel free if it's within reason. Refactoring for variable names, method names, argument/option key names and etc, are welcome.

### Code Comments

While comments are not required if the code is very well self explanatory, they do help other developers understand the code better.

Existing code may not have enough comments, but you are welcome to add them in if you understand what the method/code is doing.

If your variables, method names, syntax, methodology and etc do not explain well what the code is doing, then please add comments.

Comments should be above the line it's regarding. If the comment is very minor such as a suggestion, it may be on the same line, after the code.

### Commit Messages

Messages are worded in a way that the commit itself is doing something. It is in the present tense, not past or future.

Commit message summaries are like titles, they do not make sense to have periods, commas and other text segmentations. If the commit is complicated enough that you can not break it down into further commits, and requires commas and other text segmentations, then it may be acceptable. Each message should say what the commit changes are doing, with the main keywords in the summary.

Acceptable: "Fix xx", "Add xx", "Change xx"

Unacceptable: "Fixed xx", "Added xx", "Changed xx", "xx \(fix\)", "oops", "More changes", etc

If you make a lot of changes and you are about to stage them into multiple commits, please keep related changes with each other, and non-related changes in different commits. Please keep in mind that the purpose of doing this is to help with file history, commit reverting and other change/file specific things.

For example, if you refactor a variable name or type, a commit may include only those specific changes. It should not include something unrelated such as a fix, new feature or other unrelated things.

New chunks of code, such as new methods, new features, method rewrites and etc, may all be in one commit if they are related to each other. If there are multiple new chunks of code where some may add feature x, yet the rest fixes issue xx, then multiple commits are needed.

An exception to not having multiple unrelated changes in a single commit, is if the changes help keep the project working and tests passing after each commit. Such that a single commit does not break the project in a way that tests fail and/or it becomes unusable. There will be some cases where some commits will break and not pass tests, yet future commits will pass tests.

## Testing

Install development dependencies for this module: `npm install`

Then run the test npm script: `npm test`

If you want the tests to automatically run after any file change, run: `npm run test-watch`

If the timeout specified for mocha is too short for your device to complete the tests within, you may extend the timeout, but please do not push the changed timeout in a commit.

Test files are located under `tests/`
