# Conclave Story App

## What this app is

This is a single-folder storytelling app made with plain HTML, CSS, and JavaScript.

It runs offline.

It is driven by two editable files:

- `data/story.json` for the story screens, text, choices, links, and frustration values
- `data/settings.json` for app-level settings like audio, background image, and the click threshold

The app is designed so a non-technical editor can replace files with the same names and edit simple JSON text without using a build step or a server.

## How to open it offline

1. Open the project folder.
2. Double-click `index.html`.
3. The experience should open in Chrome.

If the story does not load, keep the folder structure the same and make sure `data/story.json` and `data/settings.json` still exist.

If Chrome blocks the local JSON files on a `file://` page, the app will show a `Select Project Folder` button. Click it and choose the main project folder that contains `index.html`, `data`, `js`, `css`, and `assets`.

## Project files

- `index.html`: the page shell
- `css/styles.css`: the full visual layout and responsive rules
- `js/utils.js`: shared helper functions, including local JSON loading for `file://` use
- `js/story-engine.js`: the branching logic, click counter, restart reset, reform tracking, and frustration rules
- `js/renderer.js`: screen rendering, image fallback, copy rendering, and action button layout
- `js/audio.js`: optional looping audio support and the audio toggle button
- `js/app.js`: app startup and wiring between the data, engine, renderer, and audio
- `data/story.json`: all story screens and branching
- `data/settings.json`: editable app settings

## How to replace images

Screen images live in `assets/images/screens/`.

Each screen already points at a fixed filename:

- `screen-01.jpg`
- `screen-02.jpg`
- ...
- `screen-26.jpg`

To replace a screen image:

1. Keep the same filename.
2. Replace the file in `assets/images/screens/`.
3. Reopen `index.html`.

If you want to change which screen uses which file, edit the `image` field in `data/story.json`.

## How to update the default opener image

The first screen uses `assets/images/screens/screen-01.jpg`.

Replace that file with your own file using the same name.

## How to update the background image

The app background uses `assets/images/ui/background.jpg`.

To change it:

1. Replace `background.jpg` with your own image using the same name.
2. Reopen `index.html`.

If you want to turn the background image off completely, open `data/settings.json` and change:

```json
"showBackgroundImage": true
```

to:

```json
"showBackgroundImage": false
```

## How to replace audio

Audio files live in `assets/audio/`.

The app is ready for:

- `bg-loop.mp4`
- `optional-fallback.mp3`

To add your own loop:

1. Replace `bg-loop.mp4` with your own file using the same name.
2. Optional: replace `optional-fallback.mp3` too.
3. Open `data/settings.json`.
4. Change `"enableAudio": false` to `"enableAudio": true`.
5. Reopen `index.html`.

## How to disable audio

Open `data/settings.json` and set:

```json
"enableAudio": false
```

## How to change text

Open `data/story.json`.

Every screen is listed in the `screens` array.

Each screen contains:

- `title`
- `description`
- `actions`

Change the text inside those fields and save the file.

Important:

- Keep all quote marks and commas valid
- Keep screen `id` values unique
- Keep the file as valid JSON

## How to change choices and branching

Inside each screen, look for the `actions` list.

Each action contains:

- `label`: the button text
- `target`: the next screen id
- `type`: usually `goto` or `restart`

To send a button somewhere else, change the `target` value.

Example:

```json
{
  "id": "screen-01-encourage",
  "label": "Encourage the residents go ahead",
  "type": "goto",
  "target": "screen-02"
}
```

If you change `"target": "screen-02"` to `"target": "screen-03"`, that button will go to screen 3 instead.

## How to change frustration values

Each screen can control the frustration meter with its `meter` object.

Common patterns already in the file are:

- fixed value
- inherit the previous value
- use a different value depending on how the player reached the screen

Examples:

```json
"meter": {
  "mode": "fixed",
  "value": 25
}
```

```json
"meter": {
  "mode": "inherit"
}
```

```json
"meter": {
  "mode": "byPreviousScreen",
  "defaultValue": 20,
  "byPreviousScreen": {
    "screen-03": 70
  }
}
```

To hide the meter on a screen, change:

```json
"showMeter": true
```

to:

```json
"showMeter": false
```

## How the 10-click frustration rule works

The app uses two frustration rules at the same time:

1. The screen's authored value from `data/story.json`
2. A global click counter

The click counter increases on meaningful button presses.

If the total click count goes above `10`, the visible frustration meter is forced to `100%`, unless that screen is already at `100%`.

The authored screen value is still kept as the story's main value underneath that rule.

## How to change the 10-click threshold

Open `data/settings.json` and change:

```json
"clickThreshold": 10
```

You can raise or lower that number.

## How to reset the frustration behavior

If you want the story to use only the authored screen values, set a very high click threshold in `data/settings.json`.

Example:

```json
"clickThreshold": 999
```

## How to add a new screen

1. Open `data/story.json`.
2. Copy one full screen object.
3. Paste it inside the `screens` array.
4. Give it a new `id`, such as `screen-27`.
5. Update the `title`, `description`, `image`, and `actions`.
6. Point another screen's action `target` to the new screen id.

If you add a new screen image, place the matching file in `assets/images/screens/`.

## What to do if an image does not appear

If the image is missing or broken, the app shows a placeholder panel instead of breaking.

Check these things:

1. The filename still matches the one in `data/story.json`
2. The file is in the correct folder
3. The file extension still matches the name in the JSON

## Which files should not be renamed

Do not rename these files unless you also update every reference to them:

- `index.html`
- `css/styles.css`
- `js/app.js`
- `js/story-engine.js`
- `js/renderer.js`
- `js/audio.js`
- `js/utils.js`
- `data/story.json`
- `data/settings.json`
- `assets/icons/audio-toggle.svg`

If you prefer the simplest workflow, do not rename any files at all. Just replace files using the same names.

## Quick customization checklist for non-technical editor

1. Replace the screen images in `assets/images/screens/`
2. Replace `assets/images/ui/background.jpg` if needed
3. Replace `assets/audio/bg-loop.mp4` if needed
4. Turn audio on or off in `data/settings.json`
5. Edit story text in `data/story.json`
6. Edit button labels in `data/story.json`
7. Edit branch targets in `data/story.json`
8. Edit meter values in `data/story.json`
9. Reopen `index.html` and click through the story
