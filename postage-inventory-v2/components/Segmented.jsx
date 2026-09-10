'use client';

// The count chips the published dashboard leads every table with: All, then each band
// with how many rows are in it. They do two jobs a dropdown cannot — they show the shape
// of the data before you touch anything, and they are one click rather than two.
//
// A band with no rows is shown DISABLED rather than hidden: a band that disappears
// looks like a bug, and "Received 0" is a real answer.
export default function Segmented({ value, onChange, options, label }) {
  return (
    <div className="fxseg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button"
                className={'fxsegb' + (value === o.value ? ' on' : '')}
                aria-pressed={value === o.value}
                disabled={o.n === 0 && o.value !== ''}
                onClick={() => onChange(o.value)}>
          {o.label}
          {o.n !== undefined && <b>{o.n.toLocaleString()}</b>}
        </button>
      ))}
    </div>
  );
}
