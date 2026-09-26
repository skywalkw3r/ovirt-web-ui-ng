// The Scheduling Policies query/mutation hooks moved to hooks/ so the admin
// page consumes them through the hooks layer like every other list page
// (CLAUDE.md: transport → schemas → resources → hooks → pages). This shim keeps
// the form's sibling import resolving; new code imports from
// hooks/useSchedulingPolicies directly.
export * from '../../hooks/useSchedulingPolicies'
