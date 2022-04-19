# BILDSIT

/!\ VERY EARLY

A toiny tool for making toiny website without pulling the entire npm catalogue.

# MAKE

## FIRST

First, you create your site directory, then the others directory:

```
// you put data
./site/data 

// you put pages
./site/pages

// you put templates
./site/templates
```

## THEN 

Will gather pages run through templates, apply stuff… it will also gather styles
and scripts from `<style>` and `<scripts>`.

```html
// located in 'site/pages/index.html'
{% import:/assets/script.js %}
<!DOCTYPE html>
<html>
  {% inc:head:index %}
  <body>
    <h1>OH</h1>
    {% map:releases:release %}
    {% inc:footer: %}
    <img src="{% move:/assets/test.png %}" />
  </body>
</html>

<style>
body { font-size: 120px; }
</style>
```

can generate: 

```html
<!DOCTYPE html><html><head><title>MIKUCOM: We are quite thankful.</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="MIKUCOM is the solution to all your problems"><meta name="keywords" content="MIKUCOM, agile, demoscene, demogroup"><link rel="stylesheet" href="/assets/css/index.css"/></head><body><h1>OH</h1><section><h1>romcom</h1></section><footer> I am foot</footer><img src="/assets/test.png"/><script type="text/javascript" src=/assets/js/index.js></script></body></html>
```

## operators

You use `{% %}` to repplace with a variable from data that is passed, keep
reading to find out how to pass down those variables

### inc

This will include a template

```
{% inc:footer %}
```

you can pass stuff from data

```
// here we pass 'data/index.json' to it
{% inc:footer:index.json %}
```

### map

This map over a list of stuff in data and pass the data to a template

Let say you have `data/releases/` and inside `data/releases/one.json` and 
`data/releases/two.json`, you can map over all the json and pass down what it
contains to `templates/release.html`:


```
{% map:releases:release %}
```
### get

For now, this is only if one would need to add some js or css from a script that
exists anywhere in your input directory:

```
// hey don't laugh, it's a better library than 98% of the ones on npm
{% get:assets/jquery.js %}
{% get:assets/normalise.css %}
```

You can also `get:$variable` where variable is a path to an asset.

### move

Now, that only copy/paste to the build/assets directory, useful for images and
other medias!

```html
<img src="{% move:assets/very-heavy-image.png %}" alt="this is an image" />
```
You can also `move:$variable` where variable is a path to an asset.

# RUN 

`bildsit --input ./site --output ./build`

This would end up creating a build directory with your generated website and 
will also create styles and scripts according to the pages (ie: 
`build/assets/js/index.js` for `pages/index.html`) and will put link and scripts 
tags into the templates.

