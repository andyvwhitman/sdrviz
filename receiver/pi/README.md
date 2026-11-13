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
