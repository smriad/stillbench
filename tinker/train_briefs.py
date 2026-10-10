"""Fine-tune an open-weight model on the Stillbench briefs that got you to sit.

    npx tsx scripts/export-briefs.ts      # writes data/tinker/briefs.jsonl
    pip install tinker transformers
    TINKER_API_KEY=... python tinker/train_briefs.py

Prints a tinker:// sampler path. Put it in TINKER_BRIEF_MODEL and half of the
next walks get their brief from the tuned model instead of Gemma, so the walk
log shows which one actually gets you out the door.
"""

import json
import os
import random
import sys
from pathlib import Path

import tinker
from tinker import types

BASE_MODEL = os.environ.get("TINKER_BASE_MODEL", "Qwen/Qwen3.5-4B")
EPOCHS = int(os.environ.get("TINKER_EPOCHS", "4"))
LEARNING_RATE = float(os.environ.get("TINKER_LR", "1e-4"))
DATA = Path(__file__).resolve().parent.parent / "data" / "tinker" / "briefs.jsonl"
MIN_EXAMPLES = 8


def load_examples():
    if not DATA.exists():
        sys.exit(f"No {DATA}. Run `npx tsx scripts/export-briefs.ts` first.")
    lines = [line for line in DATA.read_text().splitlines() if line.strip()]
    examples = [json.loads(line)["messages"] for line in lines]
    if len(examples) < MIN_EXAMPLES:
        sys.exit(
            f"Only {len(examples)} real sits with a model-written brief. "
            f"Sit a few more times (at least {MIN_EXAMPLES}) and export again."
        )
    return examples


def _token_ids(tokenizer, messages, **kwargs):
    out = tokenizer.apply_chat_template(messages, tokenize=True, **kwargs)
    if hasattr(out, "input_ids"):
        return list(out.input_ids)
    return list(out)


def to_datum(tokenizer, messages):
    prompt = _token_ids(
        tokenizer,
        messages[:-1],
        add_generation_prompt=True,
        enable_thinking=False,
    )
    full = _token_ids(
        tokenizer,
        messages,
        add_generation_prompt=False,
        enable_thinking=False,
    )
    completion = full[len(prompt) :]
    if not completion:
        assistant = messages[-1]["content"]
        completion = tokenizer.encode(assistant, add_special_tokens=False)
        full = prompt + completion
    n_prefix = len(full) - len(completion) - 1
    if n_prefix < 0:
        n_prefix = 0
    weights = [0.0] * n_prefix + [1.0] * len(completion)
    if not any(weights):
        raise ValueError("No supervised tokens in training example.")
    return types.Datum(
        model_input=types.ModelInput.from_ints(tokens=full[:-1]),
        loss_fn_inputs=dict(
            weights=weights,
            target_tokens=full[1:],
        ),
    )


def main():
    examples = load_examples()
    service = tinker.ServiceClient()
    training = service.create_lora_training_client(base_model=BASE_MODEL, rank=16)
    tokenizer = training.get_tokenizer()
    data = [to_datum(tokenizer, messages) for messages in examples]

    for epoch in range(EPOCHS):
        random.shuffle(data)
        result = training.forward_backward(data, "cross_entropy").result()
        training.optim_step(types.AdamParams(learning_rate=LEARNING_RATE)).result()
        print(f"epoch {epoch + 1}/{EPOCHS}  loss {getattr(result, 'loss', '?')}")

    saved = training.save_weights_for_sampler(name="stillbench-briefs").result()
    print("\nTuned on", len(data), "briefs from", BASE_MODEL)
    print("Add to .env.local:\n")
    print(f"TINKER_BRIEF_MODEL={saved.path}")


if __name__ == "__main__":
    main()
