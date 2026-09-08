"""Choose distinct supplied photos, preferring the largest supplied eBay size."""

import re
from urllib.parse import urlparse


def image_identity(url):
    parsed = urlparse(url)
    match = re.search(r"/images/g/([^/]+)/s-l(\d+)\.", parsed.path) if parsed.hostname == "i.ebayimg.com" else None
    return (parsed.hostname, match[1]) if match else url


def select_distinct_images(urls, limit):
    selected = {}
    for url in urls:
        if not isinstance(url, str) or not url:
            continue
        parsed = urlparse(url)
        if parsed.scheme != "https":
            continue
        match = re.search(r"/images/g/([^/]+)/s-l(\d+)\.", parsed.path) if parsed.hostname == "i.ebayimg.com" else None
        key = image_identity(url)
        size = int(match[2]) if match else 0
        if key not in selected or size > selected[key][0]:
            selected[key] = (size, url)
    return [value[1] for value in selected.values()][:limit]
