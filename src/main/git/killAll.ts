import { killAllClones } from './clone'
import { killAllOwnedGit } from './run'

/** Ends every git assigned to a view and every clone still in progress (app exit). */
export function killAllGit(): void {
  killAllOwnedGit()
  killAllClones()
}
