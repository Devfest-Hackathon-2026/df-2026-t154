import { useId } from 'react';
import { REVIEW_REACTIONS } from '@atono/shared';
import type { StoryReview } from '@atono/shared';

export const emptyReview: StoryReview = {
  reaction: null,
  lingering: '',
  action: '',
};

type Props = {
  value: StoryReview;
  onChange: (value: StoryReview) => void;
  disabled: boolean;
};

export function ReviewPanel({ value, onChange, disabled }: Props) {
  const id = useId();

  return (
    <section className="review-panel" aria-label="物語の振り返り">
      <fieldset className="review-reactions" disabled={disabled}>
        <legend>この物語を見て、どう感じましたか？</legend>
        {REVIEW_REACTIONS.map((reaction) => (
          <label className="review-reaction" key={reaction}>
            <input
              type="radio"
              name={`${id}-reaction`}
              value={reaction}
              checked={value.reaction === reaction}
              onChange={() => onChange({ ...value, reaction })}
            />
            <span>{reaction}</span>
          </label>
        ))}
      </fieldset>
      <div className="review-field">
        <label htmlFor={`${id}-lingering`}>
          この展開を見ても、惜しいと感じるのはどの部分ですか？
        </label>
        <textarea
          id={`${id}-lingering`}
          value={value.lingering}
          onChange={(event) =>
            onChange({ ...value, lingering: event.target.value })
          }
          rows={3}
          maxLength={1000}
          disabled={disabled}
        />
      </div>
      <div className="review-field">
        <label htmlFor={`${id}-action`}>今からでもできそうなことは？</label>
        <textarea
          id={`${id}-action`}
          value={value.action}
          onChange={(event) => onChange({ ...value, action: event.target.value })}
          rows={3}
          maxLength={1000}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
