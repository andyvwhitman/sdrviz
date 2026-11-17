# sdrviz receiver (Raspberry Pi)

Turns a Raspberry Pi with an RTL-SDR dongle into an always-on IQ server for sdrviz.
It runs `rtl_tcp` as a systemd service (`sdrviz-rtltcp`) that streams the whole AAR
railroad band (channels 07–97, 160.215–161.565 MHz) to the sdrviz backend.

## What you need
- A Raspberry Pi 5 (a Pi 4 works) with **Raspberry Pi OS Lite (64-bit)**.
- An RTL-SDR dongle (RTL-SDR Blog V3/V4 or similar) and a VHF antenna.
- Wired Ethernet if possible: the stream is about 38 Mbit/s.
- The official 5 A power supply for a Pi 5, so the dongle gets full USB power.

## 1. Put the OS on the SD card (skip if the Pi already boots)
1. On the Mac, install **Raspberry Pi Imager** (`brew install --cask raspberry-pi-imager`).
2. Choose *Raspberry Pi 5* → *Raspberry Pi OS Lite (64-bit)* → your SD card.
3. Under *Edit settings*: set a hostname (e.g. `sdrviz-pi1`), a user and password, Wi-Fi
   if you need it, and on the *Services* tab **enable SSH**.
4. Write the card, put it in the Pi and power it on. After a minute,
   `ping sdrviz-pi1.local` from the Mac should answer.

## 2. Get the code onto the Pi and run the setup
SSH in (replace the user and host), clone the repo and run the setup:
```bash
ssh andy@sdrviz-pi1.local
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/andyvwhitman/sdrviz.git ~/sdrviz
cd ~/sdrviz/receiver/pi && sudo bash setup.sh
```
To update later: `cd ~/sdrviz && git pull && cd receiver/pi && sudo bash setup.sh`.
The script:
1. installs the `rtl-sdr` tools;
2. stops Linux from loading the DVB-T TV driver for the dongle;
3. adds a udev rule so the service user can open the dongle;
4. builds the RTL-SDR Blog driver automatically if it finds a Blog V4 (R828D tuner);
5. creates a `sdrviz` system user and installs and starts the `sdrviz-rtltcp` service;
6. ends with a health check.

It is safe to run again. Your settings in `/etc/sdrviz/rtltcp.env` are kept.

If the check says the TV driver is still loaded, unplug and replug the dongle (or
`sudo reboot`) and run `sdrviz-check`.

## 3. Confirm IQ reaches the Mac
From the repo root on the Mac:
```bash
python3 receiver/tools/rtltcp_probe.py sdrviz-pi1.local
```
You should see the tuner type, a data rate close to 4.8 MB/s, and sample statistics.
With numpy installed it also lists AAR channels that are active right now.

## Day to day
| Task | Command (on the Pi) |
|---|---|
| Health report | `sdrviz-check` |
| Change frequency, gain or port | `sudo nano /etc/sdrviz/rtltcp.env` then `sudo systemctl restart sdrviz-rtltcp` |
| Service status | `systemctl status sdrviz-rtltcp` |
| Live log | `journalctl -u sdrviz-rtltcp -f` |
| Stop / start | `sudo systemctl stop sdrviz-rtltcp` / `sudo systemctl start sdrviz-rtltcp` |
| Memory and restarts of rtl_tcp | `sdrviz-check` (RSS and restart count), or `systemctl show sdrviz-rtltcp -p MemoryCurrent -p MemoryMax -p NRestarts` |

## Applying the service fixes (stop in 5 s, memory cap)

`sdrviz-rtltcp.service` now has `TimeoutStopSec=5`, `KillMode=mixed`, `SendSIGKILL=yes`, `MemoryHigh=384M` and
`MemoryMax=512M` (it once grew to 2.7 GB and took 90 s to stop). `Restart=always` starts a fresh rtl_tcp when the
cap kills it. To apply them on the Pi (sudo):
```bash
cd ~/sdrviz && git pull
sudo install -m 0644 receiver/pi/sdrviz-rtltcp.service /etc/systemd/system/sdrviz-rtltcp.service
sudo install -m 0755 receiver/pi/check.sh /usr/local/bin/sdrviz-check
sudo systemctl daemon-reload && sudo systemctl restart sdrviz-rtltcp
systemd-analyze verify /etc/systemd/system/sdrviz-rtltcp.service     # prints nothing when it is fine
time sudo systemctl stop sdrviz-rtltcp; sudo systemctl start sdrviz-rtltcp     # the stop should take under 5 s
sdrviz-check
```
Optional test of the cap (temporary, then undone): `sudo systemctl set-property --runtime sdrviz-rtltcp MemoryMax=20M`, watch
`journalctl -u sdrviz-rtltcp -f` for the kill and the restart, then `sudo systemctl revert sdrviz-rtltcp`.
`setup.sh` installs the same files, so running it again does the same. `/etc/sdrviz/rtltcp.env` is not touched (it keeps
`RTLTCP_ADDRESS=0.0.0.0`; see the comment in the file for when to switch to `127.0.0.1`).

## Tuning the gain
Start at the default (36.4 dB). Run the probe:
- **`clipped` above about 1%:** the gain is too high, so lower it.
- **`rms` below about 5 and no channels showing:** the gain may be too low, so raise it.
- **`0`:** automatic gain. Simple, but it pumps with strong signals.

## Notes
- **No password:** `rtl_tcp` has no authentication. Keep it on your home network and
  don't port-forward it.
- **One client:** only one client at a time can connect to `rtl_tcp`. While the sdrviz
  backend is connected, the probe will be refused, and the other way round.
- **Later:** the `sdrviz-agent` will replace `rtl_tcp` and add health data (temperature,
  dropped samples). These files will stay as the simple fallback.

## The node agent (sdrviz-node)

The agent runs the receiver chain on the Pi (channelizer, squelch, demod, Opus) and sends audio, spectrum, key-ups and health
to the server over one outbound WebSocket (`docs/node-protocol.md`). It reads IQ from the local `rtl_tcp` service.

Install (as root, after `setup.sh`): `cd ~/sdrviz/receiver/pi && sudo bash install-node.sh`. It makes a git checkout in
`/opt/sdrviz-node/src`, a venv in `/opt/sdrviz-node/venv`, the `sdrviz-node` command, `/etc/sdrviz-node/` and the
`sdrviz-node` service. Run it again to update.

Enroll: in the web app, Settings > Nodes > Add node, copy the node key, then on the Pi
`sudo -u sdrviz sdrviz-node enroll 'sdrviz-node1....'` (or save the key as `/etc/sdrviz-node/pi.key`) and
`sudo systemctl restart sdrviz-node`. The key is valid 24 hours and works once.

| Task | Command (on the Pi) |
|---|---|
| State of the agent and uplink | `sdrviz-node status` |
| Service status / live log | `systemctl status sdrviz-node` / `journalctl -u sdrviz-node -f` |
| Settings (rtl_tcp host and port, centre, rate, workers) | `sudo -u sdrviz nano /etc/sdrviz-node/agent.toml`, then restart the service |
| Run in the foreground against a recording | `sdrviz-node run --replay file.iq` (uint8 I/Q at the configured rate) |

Files in `/etc/sdrviz-node/`: `node.json` (server address, node id, permanent secret; mode 0600), `agent.toml`
(optional), `state.json` (what Settings commands changed: tune, gain, squelch, channels), `status.json`.
