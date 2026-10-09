/** Messages for the ?error= codes the OAuth routes redirect back with. */
export const AUTH_ERRORS: Record<string, string> = {
  oauth_cancelled: "Sign-in was cancelled. Try again whenever you're ready.",
  oauth_state: "That sign-in link expired. Start again from the buttons below.",
  oauth_failed: "We couldn't complete sign-in with that provider. Try again or use your email.",
  oauth_no_email:
    "That account didn't share a verified email, so we can't create your workspace. Use another option or sign up with email.",
  oauth_email_ambiguous: "More than one account uses this email. Sign in with your User ID instead.",
  oauth_unknown: "That sign-in option isn't available.",
  oauth_not_configured_google: "Google sign-in isn't switched on yet. Use your User ID or email for now.",
  oauth_not_configured_facebook: "Facebook sign-in isn't switched on yet. Use your User ID or email for now.",
  oauth_not_configured_apple: "Apple sign-in isn't switched on yet. Use your User ID or email for now.",
  suspended: "This account has been suspended. Contact support to reactivate it.",
};
