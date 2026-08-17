#!/bin/sh
# Assemble index.html from the shell and section fragments.
cd "$(dirname "$0")"
{
  cat shell-top.html
  for f in sections/*.html; do
    echo "<!-- ==== $f ==== -->"
    cat "$f"
  done
  cat shell-bottom.html
} > index.html
echo "built index.html ($(wc -c < index.html | tr -d ' ') bytes)"
