"use client";

import { useEffect, useId, useState } from "react";
import type { TaxonomyIndex } from "@/lib/taxonomy";
import type { PruneState, Taxon } from "@/lib/types";

export function GuessInput({
  taxonomy,
  prune,
  disabled,
  onSubmit,
}: {
  taxonomy: TaxonomyIndex;
  prune: PruneState;
  disabled: boolean;
  onSubmit: (value: string) => boolean;
}) {
  const listId = useId();
  const optionId = useId();
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const suggestions = taxonomy.searchGenera(value, prune, 8);
  const activeOptionId =
    open && suggestions[active] ? `${optionId}-${suggestions[active].id}` : undefined;

  useEffect(() => {
    setActive(0);
  }, [value]);

  function choose(taxon: Taxon) {
    if (onSubmit(taxon.name)) {
      setValue("");
    }
    setOpen(false);
  }

  function submit() {
    const picked = suggestions[active];
    if (picked && open) {
      choose(picked);
      return;
    }
    if (onSubmit(value)) {
      setValue("");
    }
    setOpen(false);
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="genus-guess">Guess a scientific genus</label>
      <div className="input-wrap">
        <input
          id="genus-guess"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={disabled ? "No more guesses" : "e.g. Tyrannosaurus"}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <button className="guess-btn" type="submit" disabled={disabled}>
          Guess
        </button>
        {open && value && (
          <ul className="suggest" id={listId} role="listbox">
            {suggestions.length === 0 ? (
              <li>
                <button type="button" disabled>
                  No remaining genera match
                </button>
              </li>
            ) : (
              suggestions.map((taxon, index) => (
                <li
                  key={taxon.id}
                  id={`${optionId}-${taxon.id}`}
                  role="option"
                  aria-selected={index === active}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(taxon)}
                  >
                    <em>{taxon.name}</em>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </form>
  );
}
