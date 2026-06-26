// Shared password policy — used by the registration form (live checklist) and
// the on-device register call (server-side parity so the rule can't be
// bypassed). Keep these rules in sync with backend/app/api/v1/auth.py.

export interface PasswordRule {
  id: string
  label: string
  test: (pw: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper',  label: 'One uppercase letter',  test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower',  label: 'One lowercase letter',  test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'One number',            test: (pw) => /[0-9]/.test(pw) },
]

/** Returns the labels of every rule the password does NOT yet satisfy. */
export function unmetPasswordRules(pw: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label)
}

export function isPasswordValid(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw))
}

/** Single human-readable sentence describing the policy, for error messages. */
export const PASSWORD_POLICY_TEXT =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.'
