import { CheckIcon } from './ui';

const A = '/assets/landing';

const BENEFITS = [
  'Reels resized for Instagram, Facebook and YouTube Shorts',
  'Weekly Google Business Profile offers keep you active on Maps',
  'Edit any caption or image before it goes live',
];

const ROWS = [
  { img: 'blog.jpeg', title: 'Mon · Blog: family weekend guide', sub: 'Website, Google Business Profile', badge: 'Published', kind: 'ok' },
  { img: 'insta-reel-cover.jpeg', title: 'Tue · Reel: first morning', sub: 'Instagram, Facebook, YouTube Shorts', badge: 'Published', kind: 'ok' },
  { img: 'social-media.jpeg', title: 'Wed · Poster: villa offer', sub: 'Instagram, Facebook', badge: 'Scheduled 7 pm', kind: 'sched' },
  { img: 'linkedin.jpeg', title: 'Thu · LinkedIn: team offsites', sub: 'Waiting for your approval', approve: true },
  { img: 'gmb.jpeg', title: 'Fri · Google post: book-direct offer', sub: 'Google Business Profile', badge: 'Scheduled 9 am', kind: 'sched' },
];

export default function Autopilot() {
  return (
    <section className="sec" id="autopilot">
      <div className="sec-in split">
        <div className="split-copy">
          <p className="eyebrow">Auto-publishing</p>
          <h2>Your whole week of posting, done.</h2>
          <p className="lead">Connect your accounts once. We schedule every post at the right time, on the right channel, in the right format. You stay in control: let it run, or approve each post with one tap.</p>
          <ul className="ticks col">
            {BENEFITS.map((b) => <li key={b}><CheckIcon />{b}</li>)}
          </ul>
        </div>

        <div className="week">
          <div className="week-bar">
            <p>Lagoon Bay Resort · this week</p>
            <span className="pill">Example data</span>
          </div>
          {ROWS.map((r) => (
            <div className="week-row" key={r.title}>
              <img src={`${A}/${r.img}`} alt="" width="56" height="56" loading="lazy" />
              <div className="week-info"><p className="t">{r.title}</p><p className="s">{r.sub}</p></div>
              {r.approve ? (
                <div className="week-actions">
                  <button type="button" className="btn btn-sm btn-outline-gray">Edit</button>
                  <button type="button" className="btn btn-sm btn-primary">Approve</button>
                </div>
              ) : (
                <span className={'badge ' + r.kind}>{r.badge}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
