# GitView

GitView is a small, dependency-free command-line tool that turns any local Git repository into a single, self-contained HTML page. It reads the repository through the `git` CLI and produces a polished report you can open, share, or archive without a server, a build step, or an internet connection.

## Features

- **Single-file output** with all CSS and JavaScript embedded. No external fonts, scripts, or assets.
- **Repository overview** with the repository name, README description, current branch, path, and remote.
- **Summary statistics** for commits, contributors, tracked files, branches, tags, and lines changed.
- **Commit activity chart** and a breakdown of top contributors and file types.
- **Complete commit history** including subjects, full messages, authors, dates, tags, branch/remote badges, merge markers, and per-file additions/deletions.
- **File tree** with sizes, a quick filter, and expand/collapse controls.
- **Instant commit search** across messages, authors, hashes, and changed file paths.
- **Dark and light themes**, with the choice remembered in `localStorage`.
- **Cross-platform**: Linux, macOS, and Windows, anywhere Python and Git are available.

## Requirements

- Python 3.9 or newer
- Git 2.20 or newer
- A local Git repository with at least one commit for the most useful report

## Installation

GitView is a single executable script. Clone the project and put it on your `PATH`:

```bash
git clone <repository-url> GitView
cd GitView
chmod +x gitview.py
ln -s "$PWD/gitview.py" ~/.local/bin/gitview
```

On Windows, run it with `py gitview.py` or create a `gitview.cmd` wrapper.

## Usage

```bash
# Report for the repository in the current directory
gitview

# Report for another repository
gitview /path/to/project

# Choose an output file
gitview . -o report.html

# Include commits from all branches and tags
gitview --all

# Render only the latest 200 commits
gitview --max-commits 200

# Write HTML to stdout
gitview -o - > report.html

# Do not launch a browser when finished
gitview --no-open
```

By default, GitView writes `gitview.html` in the current directory and opens it in your default browser.

### Options

| Option | Description |
| --- | --- |
| `repo` | Path to the repository. Defaults to the current directory. |
| `-o`, `--output FILE` | Output file. Use `-` for stdout. Defaults to `gitview.html`. |
| `--title NAME` | Override the repository display name. |
| `--rev REV` | Revision to visualize. Defaults to `HEAD`. |
| `--all` | Include commits reachable from all refs. |
| `--max-commits N` | Limit the number of commits rendered. |
| `--no-open` | Do not open the report in a browser. |
| `--version` | Print the version. |
| `-h`, `--help` | Show the full help text. |

## How it works

GitView shells out to standard read-only Git commands such as `git log`, `git ls-tree`, `git for-each-ref`, and `git rev-parse`. The parsed data is rendered into a static HTML template with no runtime dependencies. Commit subjects, messages, author names, file paths, and other repository data are HTML-escaped before rendering.

Generate a report for GitView itself:

```bash
./gitview.py . --no-open -o gitview.html
```

## Project layout

```
gitview.py   The complete CLI and report generator
README.md    Documentation
LICENSE      MIT license
```

## License

MIT
