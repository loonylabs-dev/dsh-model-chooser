# Reporting a vulnerability

**info@loonylabs.dev**, or GitHub's private vulnerability reporting if enabled on this repository.

Please do not open a public issue for an exploitable security defect. There is no bounty and no SLA — reports will be reviewed and answered promptly.

## What is worth reporting

`dsh-model-chooser` replaces the composer's model seat, answers a delegation's model question, and serves same-origin JSON routes on the harness web server. Two properties therefore matter:

* **A model switch the human did not make.** The seat commits the session's model through the harness's model directory, and the delegation dialog must never do that — it answers a delegating tool call instead. Any path where the wrong one is committed (a session model changed by a delegation answer, or a delegation sent to a route the human did not pick) is the plugin's core promise failing.
* **A route label taken from the wrong place.** The delegation dialog answers with `provider::model`, and the host plugin that reads it accepts it. Report anything that lets that label be influenced from outside the dialog's own list — the label crosses a wire boundary between two plugins.
* **The host routes.** `/model-chooser/refresh-models` writes to the `llm-pi-ai` settings section through the credentials service, and it already rejects cross-site POSTs. Anything that lets another origin trigger a write, read another origin's data, or reach the filesystem through a route parameter is worth reporting.
* **Prompt or session data leaving the browser.** The dialog renders the pending question's detail (a task label, a prompt size, the parent route). A path that sends more than that outside the loopback origin is worth reporting.

## What is not worth reporting

* The dialog lists whatever the session's model directory contains; a route that fails at its first model call because its gateway is down is the gateway, not this plugin.
* A profile that installs this plugin together with another plugin registering the same composer slot at the same priority fails at boot by design. Install one model picker.
* Prices come from `https://models.dev/api.json` over the public internet; a wrong price there is upstream data.
