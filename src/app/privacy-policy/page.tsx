export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 prose prose-slate">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: July 2026</p>

      <p className="text-slate-700">
        Hawlai ("we", "our", "us") provides lead management and advertising automation
        tools for automobile businesses in India. This policy explains what information we
        collect, how we use it, and how it is protected.
      </p>

      <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">Information We Collect</h2>
      <p className="text-slate-700">
        When a potential customer submits a Facebook or Instagram Lead Ad form connected to a
        business using our platform, we receive the information submitted in that form —
        typically name, phone number, and what they are interested in. We also process business
        account information (business name, contact details) provided when a business signs up.
      </p>

      <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">How We Use Information</h2>
      <p className="text-slate-700">
        Lead information is used solely to help the connected business follow up with their
        potential customers — for example, scoring lead quality, organizing a call queue, and
        (with the business's configuration) triggering an AI-assisted phone call. We do not
        sell or share lead data with third parties for advertising or marketing purposes.
      </p>

      <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">Data Storage</h2>
      <p className="text-slate-700">
        Data is stored securely using Supabase (PostgreSQL) with row-level security, ensuring a
        business can only access its own leads and data.
      </p>

      <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">Third-Party Services</h2>
      <p className="text-slate-700">
        We use the Meta Marketing API to capture leads and manage ads on behalf of connected
        businesses, and the Anthropic and Google Gemini APIs to generate ad copy and creative
        assets. These providers process data only as needed to deliver these features.
      </p>

      <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">Data Retention & Deletion</h2>
      <p className="text-slate-700">
        Lead and business data is retained for as long as the business's account is active.
        Businesss or individuals may request deletion of their data by contacting us at the
        email below.
      </p>

      <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">Contact</h2>
      <p className="text-slate-700">
        For any privacy questions or data deletion requests, contact us at{" "}
        <a href="mailto:qadriovaiz.ai@gmail.com" className="text-purple-400">qadriovaiz.ai@gmail.com</a>.
      </p>
    </div>
  );
}
