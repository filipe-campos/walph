#!/usr/bin/env bash
# Creates a test workspace: a git repo with one commit and some pending changes.
# Usage: make-fixture.sh [dir]   (default: $WALPH_TEST_DIR/fixture). Prints the created path.
set -euo pipefail

OUT="${WALPH_TEST_DIR:-${TMPDIR:-/tmp}/walph-test}"
DIR="${1:-$OUT/fixture}"

rm -rf "$DIR"
mkdir -p "$DIR/src/utils"
cd "$DIR"

git init -q -b main
git config user.name "Walph Test"
git config user.email "walph-test@example.com"

cat > src/index.ts <<'EOF'
import { soma } from './utils/math'

export function main(): void {
  console.log(soma(2, 3))
}
EOF

cat > src/utils/math.ts <<'EOF'
export function soma(a: number, b: number): number {
  return a + b
}

export function multiplica(a: number, b: number): number {
  return a * b
}
EOF

printf '# Fixture\n\nWalph test project. Accents: ação, coração.\n' > README.md
printf 'node_modules/\ndist/\n' > .gitignore

git add -A
git commit -q -m "commit inicial"

# Pending changes: one modified file and one untracked file.
printf '\nexport const PI = 3.14 // soma\n' >> src/utils/math.ts
echo 'rascunho' > notas.txt

echo "$DIR"
