// Items of the git pickers in the quick input: branches, new branch name, stash message and stash choice.
import { t } from '@shared/i18n'
import type { GitBranch, GitStash } from '@shared/types'
import { rankByLabel } from '../../lib/rankByLabel'
import { relativeTime } from '../../lib/relativeTime'
import type { StashAction } from '../../types/quickInput'
import { cloneRepository } from '../../cloneActions'
import { highlight } from './highlight'
import type { CloneUrlChecked } from './useCloneUrlCheck'
import type { QuickItem, QuickList } from './buildItems'
import {
  checkoutBranch,
  createBranch,
  openCreateBranchPicker,
  stashApply,
  stashDrop,
  stashPop,
  stashSave
} from '../../gitActions'

// ---------- Branches ----------

/**
 * Branch picker: "Create new branch…", the local ones (the current one marked) and the remote ones, with the short
 * hash.
 */
export function buildBranchList(text: string, branches: GitBranch[] | null): QuickList {
  const m = t().quickInput.git
  const create: QuickItem = {
    key: '__create',
    icon: 'codicon-add',
    label: m.createBranchItem,
    run: openCreateBranchPicker
  }
  if (!branches) return { items: [create], hint: m.loadingBranches }

  const query = text.trim()
  // With a query, the best match first (local before remote on a tie); without a query, main's order.
  const scored = rankByLabel(branches, query, (b) => b.name, {
    sort: true,
    tiebreak: (a, b) => Number(a.remote) - Number(b.remote)
  })

  const items = scored.map(({ entry: branch, matches }): QuickItem => ({
    key: `${branch.remote ? 'r' : 'l'}:${branch.name}`,
    icon: branch.remote ? 'codicon-cloud' : 'codicon-git-branch',
    label: highlight(branch.name, new Set(matches), 0),
    tag: branch.current ? m.currentBranch(branch.shortHash) : branch.shortHash,
    // We are already on it: picking the current branch does nothing.
    run: () => {
      if (!branch.current) void checkoutBranch(branch.name, branch.remote)
    }
  }))
  // With a query, the best match goes first (Enter switches to it); the creation comes right after.
  return { items: query ? [...items, create] : [create, ...items], message: m.noBranches }
}

export function buildCreateBranchList(text: string, current: string | null): QuickList {
  const name = text.trim()
  const m = t().quickInput.git
  if (!name) return { items: [], message: m.typeBranchName }
  return {
    items: [
      {
        key: 'create',
        icon: 'codicon-git-branch',
        label: m.createBranch(name),
        tag: current ? m.fromBranch(current) : undefined,
        run: () => void createBranch(name)
      }
    ]
  }
}

// ---------- Clone ----------

/**
 * URL of the repository to clone: the validation comes from main (`checkCloneUrl`); without a response for this URL,
 * nothing to pick.
 */
export function buildCloneUrlList(text: string, checked: CloneUrlChecked | null): QuickList {
  const url = text.trim()
  const m = t().quickInput.git
  if (!url) return { items: [], message: m.typeCloneUrl }
  if (!checked) return { items: [], hint: m.checkingUrl }
  if (!checked.ok) return { items: [], message: checked.error }
  const { name } = checked
  return {
    items: [
      {
        key: 'clone',
        icon: 'codicon-repo-clone',
        label: m.cloneInto(name),
        tag: m.chooseDestination,
        run: () => void cloneRepository(url, name)
      }
    ]
  }
}

// ---------- Stash ----------

export function buildStashMessageList(text: string): QuickList {
  const message = text.trim()
  const m = t().quickInput.git
  return {
    items: [
      {
        key: 'save',
        icon: 'codicon-archive',
        label: message ? m.stashWithMessage(message) : m.stashChanges,
        tag: message ? undefined : m.optionalMessage,
        run: () => void stashSave(message)
      }
    ]
  }
}

const stashLabel = (stash: GitStash): string => stash.message || `stash@{${stash.index}}`

export function buildStashList(text: string, stashes: GitStash[], action: StashAction): QuickList {
  const query = text.trim()
  const items = rankByLabel(stashes, query, stashLabel, { sort: false }).map(
    ({ entry: stash, matches }): QuickItem => ({
      key: String(stash.index),
      icon: 'codicon-archive',
      label: highlight(stashLabel(stash), new Set(matches), 0),
      tag: relativeTime(stash.date),
      run: () => {
        if (action === 'apply') void stashApply(stash.index, stash.hash)
        else if (action === 'pop') void stashPop(stash.index, stash.hash)
        else void stashDrop(stash.index, stash.hash)
      }
    })
  )
  return {
    items,
    message: stashes.length ? t().quickInput.git.noStashMatch : t().quickInput.git.noStashes,
    hint: items.length ? t().quickInput.git.stashHint[action] : undefined
  }
}
