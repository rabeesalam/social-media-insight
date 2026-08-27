export const metadata = { title: 'Terms of Service — Social Analytics' }

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-16 text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-semibold">Terms of Service</h1>
        <p className="mb-8 text-sm text-neutral-500">Last updated August 27, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-neutral-300">
          <p>
            Social Analytics is an internal analytics tool operated by Puresquare for tracking the
            performance of social media accounts that Puresquare owns or is authorized to manage.
            It is not a public product and is not available for use by the general public.
          </p>
          <p>
            The application connects to social media platforms (including but not limited to
            YouTube, TikTok, Instagram, Facebook, Threads, and X) exclusively through each
            platform&apos;s official authorization flow (OAuth). It does not request, store, or
            process account passwords, and it accesses only the data those platforms&apos; official
            APIs make available under the permissions explicitly granted during authorization.
          </p>
          <p>
            Access to connected accounts and any data collected through this tool is limited to
            authorized Puresquare personnel. Data collected is used solely for internal reporting
            and performance analysis and is not sold, shared, or made available to third parties.
          </p>
          <p>
            A connected account&apos;s owner may revoke this application&apos;s access at any time
            through that platform&apos;s own account settings, which immediately stops any further
            data collection from that account.
          </p>
          <p>
            This tool is provided on an as-is, internal basis with no warranty of any kind. For
            questions about these terms, contact{' '}
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
