'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../lib/supabaseClient';

type Campaign = {
  id: string;
  name: string;
  location: string | null;
  target_business_type: string | null;
  search: { target_role?: string; target_location?: string | null } | null;
  outreach: { hourly_cap?: number; daily_cap?: number; campaign_days?: number; mode?: string; agent_days?: number; last_agent_run_started_at?: string; last_agent_run_finished_at?: string } | null;
  status: string;
  created_at: string;
};

type ConnectorStatus = 'not-connected' | 'connecting' | 'connected';

function roleFor(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || 'Target not set';
}

function locationFor(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || '';
}

function statusLabel(status: string) {
  if (status === 'launched') return 'Agent running';
  if (status === 'active') return 'Agent active';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'paused') return 'Paused';
  return status || 'Draft';
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [resumeReady, setResumeReady] = useState(false);
  const [gmailReady, setGmailReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const latestCampaign = campaigns[0] || null;
  const campaignRunning = latestCampaign?.status === 'scheduled' || latestCampaign?.status === 'active' || latestCampaign?.status === 'launched';
  const canStartCampaign = Boolean(latestCampaign && resumeReady && gmailReady && !campaignRunning && !busy);
  const gmailConnectorStatus: ConnectorStatus = busy && !gmailReady ? 'connecting' : gmailReady ? 'connected' : 'not-connected';

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage('');
    setMessage('');

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.replace('/');
        return;
      }

      const userEmail = userData.user.email || '';
      setEmail(userEmail);

      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('id,name,location,target_business_type,search,outreach,status,created_at')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (campaignError) throw campaignError;
      setCampaigns((campaignData || []) as Campaign[]);

      const { data: resumeData } = await supabase
        .from('resume_profiles')
        .select('id,full_name,skills,work_experience')
        .eq('profile_id', userData.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setResumeReady(Boolean(resumeData?.id));

      const { data: authData } = await supabase
        .from('user_email_authorizations')
        .select('status')
        .eq('user_identifier', userEmail || userData.user.id)
        .eq('provider', 'google')
        .maybeSingle();

      setGmailReady(authData?.status === 'connected');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace('/');
  }

  async function connectGmail() {
    setBusy(true);
    setErrorMessage('');
    setMessage('');

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Missing login session. Please sign in again.');

      const response = await fetch('/api/applix/connect-gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, return_to: `${window.location.origin}/dashboard` }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Google authorization URL was not returned.');

      window.location.href = data.authorization_url;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not connect Gmail.');
      setBusy(false);
    }
  }

  function showDisconnectWarnings() {
    window.alert('Applix is already connected.');
    window.alert('To disconnect Applix, remove its access from your Google account permissions.');
  }

  function handleConnectorCardClick() {
    if (gmailReady) {
      showDisconnectWarnings();
      return;
    }

    if (busy) return;
    void connectGmail();
  }

  async function startCampaign() {
    if (!latestCampaign) {
      router.push('/campaign/new');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setMessage('');

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Missing login session. Please sign in again.');

      const response = await fetch('/api/applix/schedule-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, campaign_id: latestCampaign.id, enabled: true }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not start campaign.');

      const agentSummary = data.agent_run?.active_agent_campaigns ?? data.agent_run?.checked_campaigns;
      const summaryText = typeof agentSummary === 'number' ? ` First agent run checked ${agentSummary} campaign${agentSummary === 1 ? '' : 's'}.` : ' First agent run started.';
      setMessage(`Campaign launched.${summaryText} Opening the tracker...`);
      router.push('/tracker');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not start campaign.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    const confirmed = window.confirm(`Delete campaign '${campaign.name}'? This will remove it from your Applix dashboard.`);
    if (!confirmed) return;

    setBusy(true);
    setErrorMessage('');
    setMessage('');

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Missing login session. Please sign in again.');

      const response = await fetch('/api/applix/delete-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, campaign_id: campaign.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not delete campaign.');

      setMessage('Campaign deleted.');
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete campaign.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className='applix-home-shell dashboard-cockpit-shell'>
        <button className='applix-setup-back' type='button' onClick={() => router.back()} aria-label='Go back'>←</button>
        <button className='home-signout' type='button' onClick={signOut} style={{ right: 'clamp(96px, 11vw, 140px)' }}>Sign out</button>
        <div className='applix-setup-info' title={email || 'Applix dashboard'}>i</div>

        <section className='applix-home-center dashboard-hero'>
          <img src='/applix-logo.svg' alt='Applix logo' style={{ width: 'clamp(120px, 18vw, 190px)', height: 'auto', display: 'block', objectFit: 'contain', marginBottom: '-4px', filter: 'drop-shadow(0 18px 25px rgba(0,0,0,.18))' }} />
          <p style={{ margin: '10px 0 12px', color: '#ff5ca8', fontSize: 'clamp(46px, 8vw, 74px)', fontWeight: 950, letterSpacing: '.18em' }}>APPLIX</p>
          <p className='applix-setup-kicker'>Persistence at Scale</p>
          <h1>Welcome back</h1>
          <p className='applix-home-copy dashboard-subtitle'>Signup, setup, start, and sleep while Applix works in the background.</p>
        </section>

        <section className='applix-home-bottom dashboard-stack'>
          {loading && <p className='applix-setup-status success'>Loading your Applix workspace...</p>}
          {message && <p className='applix-setup-status success'>{message}</p>}
          {errorMessage && <p className='error-text' style={{ textAlign: 'center' }}>{errorMessage}</p>}

          <div className='home-campaign-card dashboard-card-clean applix-intro-card'>
            <strong>I am Applix.</strong>
            <p>I am here to help you get the opportunity. Set me up once and I will automate your task.</p>
            <p>My skill is simple: give me your resume and tell me what opportunities you want. I will knock every door for you.</p>
            <p>I will knock 100 doors a day for 10 days.</p>
          </div>

          <div className='home-campaign-card dashboard-card-clean resume-card-wrap'>
            <p className='resume-warning'>Your Resume Will Be Attached to the Email, Please Use The Current And Best Resume</p>
            <Link className={`home-check resume-action ${resumeReady ? 'ready' : ''}`} href='/resume-canvas'>
              <img
                className="dashboard-status-icon resume-status-icon"
                src={resumeReady ? "/resume-status/resume-has-been-updated.gif" : "/resume-status/upload-resume.gif"}
                alt={resumeReady ? "Resume has been uploaded" : "Upload resume"}
              />
              <div>
                <strong>Upload / Change Resume</strong>
                <p>{resumeReady ? 'Resume data is saved.' : 'Drag and drop your DOC or DOCX resume.'}</p>
              </div>
            </Link>
          </div>

          <div className='home-check-grid dashboard-single-row'>
            <button
              className={`home-check dashboard-app-connect ${gmailReady ? 'ready' : ''} status-${gmailConnectorStatus}`}
              type='button'
              onClick={handleConnectorCardClick}
              aria-disabled={busy && !gmailReady}
              aria-label={gmailReady ? 'Applix connected' : busy ? 'Connecting Applix' : 'Connect Applix'}
            >
              <img
                className="dashboard-status-icon connector-status-icon"
                src={`/connector-status/${gmailConnectorStatus}.svg`}
                alt={`Applix connector ${gmailConnectorStatus}`}
              />
              <div>
                <strong>
                  {gmailReady ? 'Applix connected' : busy ? 'Connecting Applix...' : 'Applix disconnected'}
                </strong>
                <p>
                  {gmailReady ? 'Applix is connected.' : busy ? 'Opening secure connection...' : 'Tap to connect Applix to my app.'}
                </p>
              </div>
            </button>
          </div>

          <div className='home-campaign-card dashboard-card-clean campaign-summary-card'>
            {latestCampaign ? (
              <>
                <span className='campaign-pill'>Active campaign</span>
                <strong>{latestCampaign.name}</strong>
                <p className='campaign-target'>{roleFor(latestCampaign)}{locationFor(latestCampaign) ? ` in ${locationFor(latestCampaign)}` : ''}</p>
                <div className='campaign-status-box'><span className='pulse-dot' /><span>{statusLabel(latestCampaign.status)}</span></div>
                {latestCampaign.status === 'launched' && <p>Applix is working in the background for {latestCampaign.outreach?.agent_days || 10} days.</p>}
                <div className='home-action-row campaign-buttons' style={{ marginTop: 16 }}>
                  <Link className='ghost-link' href='/campaign/new'>New campaign</Link>
                  <button className='ghost-button' type='button' onClick={() => deleteCampaign(latestCampaign)} disabled={busy} style={{ borderColor: 'rgba(248,113,113,.55)', background: 'rgba(254,226,226,.72)', color: '#991b1b' }}>{busy ? 'Deleting...' : 'Delete campaign'}</button>
                </div>
              </>
            ) : (
              <>
                <strong>Browse Template</strong>
                <p>Choose or create a campaign template.</p>
                <Link className='browse-template-button' href='/campaign/templates'>Browse Template</Link>
              </>
            )}
          </div>

          <div className='applix-home-actions dashboard-actions'>
            {!resumeReady && <Link className='applix-setup-outline' href='/resume-canvas'>Upload Resume</Link>}
            {!gmailReady && <button className={`applix-setup-outline connector-button status-${gmailConnectorStatus}`} type='button' onClick={connectGmail} disabled={busy || !email}>{busy ? 'Opening...' : 'Connect Applix'}</button>}
            {!latestCampaign && <Link className='applix-setup-outline recommended-template-action' href='/campaign/templates'>Browse Template</Link>}
            {!latestCampaign && <Link className='applix-setup-outline' href='/campaign/new'>Create Campaign</Link>}
            {campaignRunning ? <Link className='applix-setup-primary' href='/tracker'>Track Applix Log</Link> : <button className='applix-setup-primary' type='button' onClick={startCampaign} disabled={!canStartCampaign}>{canStartCampaign ? 'Start Campaign' : 'Complete setup first'}</button>}
          </div>
        </section>
      </main>

      <style>{`
        .dashboard-cockpit-shell { grid-template-rows: auto 1fr !important; overflow-y: auto !important; justify-items: center !important; padding: clamp(12px, 3vw, 26px) 14px 42px !important; background-color: #fff7fb !important; background-image: linear-gradient(rgba(255,70,190,.24) 1px, transparent 1px), linear-gradient(90deg, rgba(255,70,190,.24) 1px, transparent 1px) !important; background-size: 28px 28px !important; color: #16131a !important; }
        .dashboard-cockpit-shell::before { content: '' !important; display: block !important; position: fixed !important; inset: -12% -35% -20% !important; background-image: linear-gradient(rgba(20,16,22,.34) 1px, transparent 1px), linear-gradient(90deg, rgba(20,16,22,.34) 1px, transparent 1px) !important; background-size: 28px 28px !important; transform: perspective(760px) rotateX(22deg) scale(1.08) !important; transform-origin: top center !important; opacity: .28 !important; pointer-events: none !important; z-index: 0 !important; -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,.88) 16%, rgba(0,0,0,.88) 84%, transparent 100%) !important; mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,.88) 16%, rgba(0,0,0,.88) 84%, transparent 100%) !important; }
        .dashboard-cockpit-shell::after { content: '' !important; position: fixed !important; inset: 0 !important; background: radial-gradient(circle at 50% 18%, rgba(255,255,255,.94), rgba(255,255,255,.7) 34%, transparent 68%) !important; pointer-events: none !important; z-index: 0 !important; }
        .dashboard-cockpit-shell > * { position: relative !important; z-index: 1 !important; }
        .applix-setup-back, .home-signout, .applix-setup-info { position: fixed !important; top: max(14px, env(safe-area-inset-top)) !important; background: rgba(255,255,255,.72) !important; color: #16131a !important; border: 1px solid rgba(22,19,26,.16) !important; box-shadow: 0 10px 26px rgba(0,0,0,.09) !important; backdrop-filter: blur(12px) !important; z-index: 20 !important; }
        .applix-setup-back { left: 14px !important; width: 50px !important; height: 50px !important; }
        .home-signout { left: 50% !important; right: auto !important; transform: translateX(-50%) !important; min-width: 96px !important; height: 44px !important; padding: 0 18px !important; }
        .applix-setup-info { right: 14px !important; width: 50px !important; height: 50px !important; }
        .dashboard-hero { width: min(760px, 92vw) !important; padding-top: clamp(86px, 14vh, 112px) !important; margin-bottom: clamp(18px, 4vw, 34px) !important; text-align: center !important; justify-items: center !important; color: #16131a !important; }
        .dashboard-hero img { width: clamp(84px, 22vw, 126px) !important; margin-bottom: 2px !important; }
        .dashboard-hero > p:first-of-type { font-size: clamp(38px, 12vw, 68px) !important; margin: 6px 0 8px !important; }
        .dashboard-hero h1 { font-size: clamp(38px, 10vw, 72px) !important; line-height: .95 !important; color: #16131a !important; margin-top: 18px !important; }
        .dashboard-hero .applix-setup-kicker { color: #16131a !important; letter-spacing: .18em !important; }
        .dashboard-subtitle { display: block !important; margin-top: 14px !important; font-size: clamp(15px, 3.7vw, 20px) !important; line-height: 1.42 !important; color: rgba(22,19,26,.82) !important; }
        .dashboard-stack { width: min(760px, 92vw) !important; margin: 0 auto !important; display: grid !important; justify-items: center !important; gap: clamp(16px, 3.5vw, 26px) !important; }
        .dashboard-card-clean, .dashboard-single-row, .dashboard-actions { width: 100% !important; }
        .dashboard-card-clean, .resume-action, .dashboard-app-connect { background: rgba(255,255,255,.68) !important; border: 1px solid rgba(255,92,168,.28) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.7), 0 18px 44px rgba(255,92,168,.1), 0 14px 34px rgba(0,0,0,.06) !important; backdrop-filter: blur(16px) saturate(1.08) !important; color: #16131a !important; }
        .dashboard-card-clean { text-align: center !important; padding: clamp(20px, 4vw, 30px) !important; display: grid !important; justify-items: center !important; gap: 12px !important; border-radius: 26px !important; }
        .dashboard-card-clean strong { font-size: clamp(21px, 4.5vw, 32px) !important; line-height: 1.15 !important; margin-bottom: 0 !important; color: #16131a !important; }
        .dashboard-card-clean p, .home-check p { font-size: clamp(14px, 3.2vw, 17px) !important; line-height: 1.45 !important; color: rgba(22,19,26,.78) !important; }
        .home-check strong { color: #16131a !important; }
        .applix-intro-card p { max-width: 600px !important; text-align: center !important; }
        .resume-warning { max-width: 650px !important; color: #16131a !important; font-weight: 950 !important; text-align: center !important; }
        .resume-action, .dashboard-app-connect { width: 100% !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding: clamp(18px, 3.8vw, 26px) !important; min-height: clamp(168px, 30vw, 230px) !important; gap: 6px !important; text-align: center !important; border-radius: 22px !important; position: relative !important; }
        .resume-action::before, .dashboard-app-connect::before { width: clamp(58px, 15vw, 76px); height: clamp(58px, 15vw, 76px); display: grid; place-items: center; border-radius: 999px; background: rgba(255,255,255,.82); border: 2px solid #082235; color: #082235; box-shadow: 0 8px 18px rgba(8,34,53,.16), inset 0 0 0 4px rgba(255,255,255,.7); font-size: clamp(30px, 8vw, 42px); line-height: 1; font-weight: 950; }
        .resume-action::before { content: '⇩'; }
        .dashboard-app-connect::before { content: '' !important; width: clamp(56px, 16vw, 78px); height: clamp(40px, 12vw, 58px); border: 0 !important; border-radius: 0 !important; background: url('/connector-status/not-connected.svg') center / contain no-repeat !important; box-shadow: none !important; }
        .dashboard-app-connect.status-connecting::before { background-image: url('/connector-status/connecting.svg') !important; animation: connectorPulse 1s ease-in-out infinite; }
        .dashboard-app-connect.status-connected::before, .dashboard-app-connect.ready::before { content: '' !important; background: url('/connector-status/connected.svg') center / contain no-repeat !important; border: 0 !important; box-shadow: none !important; }
        .resume-action.ready::before { background: #082235; color: white; border-color: #082235; box-shadow: 0 10px 22px rgba(8,34,53,.24), 0 0 24px rgba(255,92,168,.28); }
        .resume-action.ready, .dashboard-app-connect.ready { border: 1.8px solid rgba(255,92,168,.96) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 0 0 1px rgba(255,92,168,.18), 0 0 26px rgba(255,92,168,.2), 0 18px 44px rgba(0,0,0,.07) !important; }
        .resume-action::before, .resume-action.ready::before, .dashboard-app-connect::before, .dashboard-app-connect.status-connecting::before, .dashboard-app-connect.status-connected::before, .dashboard-app-connect.ready::before { content: none !important; display: none !important; width: 0 !important; height: 0 !important; min-width: 0 !important; min-height: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important; animation: none !important; }
        .dashboard-status-icon { display: block !important; object-fit: contain !important; object-position: center !important; margin: 0 auto 16px !important; flex-shrink: 0 !important; }
        .resume-status-icon { width: clamp(170px, 32vw, 230px) !important; max-width: 100% !important; height: auto !important; }
        .connector-status-icon { width: clamp(150px, 30vw, 210px) !important; max-width: 100% !important; height: auto !important; transform: scale(1.25) !important; transform-origin: center !important; }
        .resume-action div, .dashboard-app-connect div { display: grid !important; justify-items: center !important; text-align: center !important; gap: 4px !important; }
        .resume-action > span, .dashboard-app-connect > span { display: none !important; }
        .resume-action strong, .dashboard-app-connect strong { font-size: clamp(18px, 4.2vw, 26px) !important; line-height: 1.2 !important; text-align: center !important; }
        .dashboard-single-row { grid-template-columns: 1fr !important; }
        .campaign-summary-card { gap: 12px !important; padding-top: clamp(26px, 4.5vw, 38px) !important; padding-bottom: clamp(26px, 4.5vw, 38px) !important; }
        .campaign-summary-card p { text-align: center !important; }
        .campaign-pill { display: inline-flex; align-items: center; justify-content: center; padding: 7px 14px; border-radius: 999px; background: rgba(255,92,168,.12); border: 1px solid rgba(255,92,168,.28); color: #b91c65; font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .campaign-target { color: rgba(22,19,26,.78) !important; max-width: 560px !important; }
        .campaign-status-box { display: inline-flex; align-items: center; justify-content: center; gap: 10px; margin-top: 2px; padding: 12px 18px; border-radius: 999px; background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.24); color: #065f46; font-weight: 950; }
        .pulse-dot { width: 10px; height: 10px; border-radius: 999px; background: #10b981; box-shadow: 0 0 18px rgba(16,185,129,.55); }
        .campaign-buttons { width: 100% !important; }
        .browse-template-button { width: min(100%, 330px); min-height: 56px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; padding: 14px 20px; background: #ff5ca8; border: 1px solid #ff5ca8; color: #16131a; font-size: clamp(17px, 4.2vw, 22px); font-weight: 950; box-shadow: 0 12px 28px rgba(0,0,0,.08); }
        .dashboard-actions .applix-setup-outline, .dashboard-actions .applix-setup-primary { color: #16131a !important; border-color: rgba(22,19,26,.78) !important; background: rgba(255,255,255,.58) !important; box-shadow: 0 12px 28px rgba(0,0,0,.08) !important; }
        .dashboard-actions .applix-setup-outline[href='/resume-canvas']::before, .dashboard-actions button.applix-setup-outline::before { display: inline-grid; place-items: center; width: 34px; height: 34px; margin-right: 10px; border-radius: 999px; border: 1.5px solid #082235; color: #082235; background: rgba(255,255,255,.78); font-size: 20px; font-weight: 950; }
        .dashboard-actions .applix-setup-outline[href='/resume-canvas']::before { content: '⇩'; }
        .dashboard-actions button.applix-setup-outline::before { content: '' !important; border: 0 !important; border-radius: 0 !important; width: 42px !important; height: 30px !important; background: url('/connector-status/not-connected.svg') center / contain no-repeat !important; }
        .dashboard-actions button.applix-setup-outline.status-connecting::before { background-image: url('/connector-status/connecting.svg') !important; animation: connectorPulse 1s ease-in-out infinite; }
        .dashboard-actions .applix-setup-primary, .dashboard-actions .recommended-template-action { background: #ff5ca8 !important; border-color: #ff5ca8 !important; }
        .dashboard-actions .applix-setup-primary:disabled { background: rgba(22,19,26,.36) !important; border-color: transparent !important; color: rgba(255,255,255,.72) !important; }
        .applix-setup-status.success { background: rgba(255,255,255,.62) !important; color: #065f46 !important; border: 1px solid rgba(16,185,129,.22) !important; }
        .ghost-link, .ghost-button { color: #16131a !important; border-color: rgba(22,19,26,.2) !important; background: rgba(255,255,255,.55) !important; }
        @keyframes connectorPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.04); opacity: .78; } }
        @media (max-width: 640px) { .dashboard-cockpit-shell { padding-left: 14px !important; padding-right: 14px !important; } .dashboard-hero { padding-top: 78px !important; margin-bottom: 24px !important; } .dashboard-hero h1 { font-size: clamp(38px, 11vw, 58px) !important; } .dashboard-stack { width: min(100%, 430px) !important; } .dashboard-card-clean { border-radius: 22px !important; padding: 20px !important; } .resume-action, .dashboard-app-connect { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; border-radius: 22px !important; } .resume-status-icon { width: clamp(145px, 42vw, 185px) !important; } .connector-status-icon { width: clamp(135px, 40vw, 175px) !important; transform: scale(1.3) !important; } .dashboard-status-icon { margin-bottom: 14px !important; } .dashboard-app-connect::before { display: none !important; } .dashboard-actions .applix-setup-primary, .dashboard-actions .applix-setup-outline { min-height: 58px !important; font-size: clamp(18px, 5.4vw, 24px) !important; } }
      `}</style>
    </>
  );
}
