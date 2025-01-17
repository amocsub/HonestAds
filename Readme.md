# HonestAds

Just a script to scrap and make the Google Ads transparency center more Honest

For help
```bash
./HonestAds -h
```

To see who is advertising on your domain
```bash
./HonestAds mews.com mews.com | jq -r 'select(.advertiser_name != "MEWS SYSTEMS LIMITED") | .advertiser_name' | sort -u
```