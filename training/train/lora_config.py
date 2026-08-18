"""Named, versioned LoRA + training config — kept as real Python objects
here rather than buried in CLI argv, so a given training run's exact
config is easy to read, diff, and reference from the eval writeup later.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class LoraSftConfig:
    name: str = "topiadesk-chat-v1"
    base_model_id: str = "Qwen/Qwen2.5-0.5B-Instruct"

    # LoRA — "everywhere" recipe: all attention + MLP projections. Still only
    # a few million trainable params at 0.5B scale, affordable on CPU, and
    # tends to help small-scale SFT quality more than it risks overfitting
    # given the dataset size after augmentation.
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    lora_target_modules: list[str] = field(
        default_factory=lambda: [
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ]
    )

    # fp32, not bf16 — the i7-7820HQ (2017 mobile silicon) lacks the
    # AVX512/native bf16 support that would make mixed precision actually
    # pay off on CPU; don't chase a speedup that isn't real on this hardware.
    torch_dtype: str = "float32"

    # CPU-memory-conscious micro-batch, real effective batch via accumulation.
    per_device_train_batch_size: int = 2
    gradient_accumulation_steps: int = 8
    max_seq_length: int = 512

    learning_rate: float = 2e-4
    lr_scheduler_type: str = "cosine"
    warmup_ratio: float = 0.05
    num_train_epochs: int = 3
    weight_decay: float = 0.01

    logging_steps: int = 5
    eval_strategy: str = "epoch"
    save_strategy: str = "epoch"
    save_total_limit: int = 3

    seed: int = 42


DEFAULT_CONFIG = LoraSftConfig()
