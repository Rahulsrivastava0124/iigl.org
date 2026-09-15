import { useState } from 'react';
import { Send } from 'lucide-react';
import { postPublic } from '../lib/api.js';

const inputClass =
  'w-full rounded-lg border border-[#e6e8ee] bg-[#f8f9fb] px-3 text-[14px] text-[#3c4252] outline-none placeholder:text-[#8b93a7] focus:border-[#d58a2b] focus:bg-white';
const labelClass = 'mb-1.5 block text-[13px] font-medium text-[#2c3b64]';

/**
 * The website's enquiry form, in its white card: a question about one course on
 * its page (`courseId`), or a general one on the Education page. Either way it
 * is filed in Student › Enquiry, source Website, for head office to call back.
 * Registering is the separate RegistrationForm.
 * `received` finishes the thank-you: "We have your {received}".
 */
export default function EnquiryForm({ courseId, heading, intro, button, received }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', message: '' });
  // 'idle', 'sending', then 'done' once the API has it.
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      await postPublic('/public/course-enquiries', courseId ? { course_id: courseId, ...form } : form);
      setState('done');
    } catch (e) {
      setError(e.message);
      setState('idle');
    }
  };

  return (
    <div className="rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)] sm:p-8">
      <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[28px] font-medium text-[#061948]">
        {heading}
      </h2>

      {state === 'done' ? (
        <p role="status" className="m-0 mt-4 text-[15px] leading-[1.7] text-[#3c4252]">
          Thank you, <strong className="font-semibold">{form.name.trim()}</strong>. We have your {received} and will
          call you on {form.mobile.trim()} shortly.
        </p>
      ) : (
        <>
          <p className="m-0 mt-2 text-[15px] leading-[1.7] text-[#4a5265]">{intro}</p>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <label className="block">
              <span className={labelClass}>Full name *</span>
              <input className={`${inputClass} h-11`} value={form.name} onChange={set('name')} required maxLength={150} autoComplete="name" />
            </label>
            <label className="block">
              <span className={labelClass}>Mobile number *</span>
              <input
                className={`${inputClass} h-11`}
                type="tel"
                value={form.mobile}
                onChange={set('mobile')}
                required
                minLength={10}
                maxLength={20}
                autoComplete="tel"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Email</span>
              <input className={`${inputClass} h-11`} type="email" value={form.email} onChange={set('email')} maxLength={150} autoComplete="email" />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Message</span>
              <textarea className={`${inputClass} py-2.5`} rows={3} value={form.message} onChange={set('message')} maxLength={1000} />
            </label>
            {error && (
              <p role="alert" className="m-0 text-[14px] text-[#c62828] sm:col-span-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={state === 'sending'}
              className="inline-flex h-[50px] cursor-pointer items-center justify-center gap-3 rounded-lg border-0 bg-[#061948] px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#10285e] disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
            >
              <Send className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {state === 'sending' ? 'Sending…' : button}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
