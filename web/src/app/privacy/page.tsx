export const metadata = { title: 'Privacy Policy — Social Analytics' }

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-16 text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-semibold">Privacy Policy</h1>
        <p className="mb-8 text-sm text-neutral-500">Last updated August 27, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-neutral-300">
          <p>
            Social Analytics is an internal tool operated by Puresquare. This policy describes how
            it handles data from the social media accounts it connects to, all of which are owned
            or explicitly authorized for management by Puresquare.
          </p>

          <div>
            <h2 className="mb-2 font-semibold text-neutral-100">What we collect</h2>
            <p>
              Once an account owner authorizes a connection through a platform&apos;s official
              login flow, we collect: basic account identity (username, display name), a list of
              that account&apos;s public posts/videos, and the performance metrics each platform&apos;s
              official API makes available for them (such as views, likes, comments, shares, and
              follower counts). We never collect account passwords — authorization happens entirely
              on the platform&apos;s own login page, and we never see or store the password.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-neutral-100">How we use it</h2>
            <p>
              Collected data is used solely to display performance analytics to authorized
              Puresquare personnel in an internal dashboard. It is not used for advertising, not
              sold, and not shared with any third party outside of the service providers
              (database and hosting infrastructure) that operate this tool on our behalf.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-neutral-100">Storage and security</h2>
            <p>
              Access tokens issued by connected platforms are encrypted at rest and are never
              exposed to the web dashboard or any client application — they are used only by
              secure server-side functions to refresh data. Access to the dashboard itself is
              restricted to authenticated, authorized accounts.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-neutral-100">Your controls</h2>
            <p>
              An account owner can revoke this application&apos;s access at any time from that
              platform&apos;s own connected-apps settings. Doing so immediately stops any further
              data collection; previously collected data can be deleted on request.
            </p>
          </div>

          <p>
            Questions about this policy can be sent to{' '}
            <a href="mailto:rabees.alam@puresquare.com" className="text-neutral-100 underline">
              rabees.alam@puresquare.com
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  )
}
