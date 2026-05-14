"""Quick smoke test for the Firecrawl scraper.

Run from backend/ with venv active:
    python test_scraper.py
"""
import asyncio
import os
import sys

# Make sure .env is loaded
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv optional — set env vars manually if needed

from agent.scraper import scrape_part, scrape_model_page


async def main():
    api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    print(f"FIRECRAWL_API_KEY set: {'yes (' + api_key[:8] + '...)' if api_key else 'NO — scraper will fall back to httpx'}")
    print()

    # Test 1: part lookup
    test_ps = "PS11752778"  # Whirlpool ice maker module — known part
    print(f"Scraping part {test_ps}...")
    part = await scrape_part(test_ps)
    if part.get("error") == "scrape_failed":
        print(f"  FAILED — {part.get('detail', 'unknown error')}")
    else:
        print(f"  OK — name: {part['name']}")
        print(f"       price: ${part['price']}")
        print(f"       in_stock: {part['in_stock']}")
        print(f"       image_url: {part['image_url'][:60] if part['image_url'] else '(none)'}")
    print()

    # Test 2: model page
    test_model = "WDT780SAEM1"
    print(f"Scraping model {test_model}...")
    model = await scrape_model_page(test_model)
    if model.get("error") == "scrape_failed":
        print(f"  FAILED — model page could not be scraped")
    else:
        print(f"  OK — brand: {model['brand']}")
        print(f"       appliance_type: {model['appliance_type']}")
        print(f"       compatible parts found: {len(model['compatible_ps_numbers'])}")
        if model['compatible_ps_numbers']:
            print(f"       first few: {model['compatible_ps_numbers'][:5]}")


if __name__ == "__main__":
    asyncio.run(main())
