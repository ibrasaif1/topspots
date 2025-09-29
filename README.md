### Backend Search
- Aggregate API INSIGHT_COUNT city_polygon -> how many 4.5s to search through to find >1000 ratings
- Aggregate API INSIGHT_PLACES city_polygon -> place ID list of length from INSIGHT_COUNT
- Place Details API -> Populates all desired fields per place ID
- locationFilter needs to be polygon
    - circle is harder to divide and region (by inputting place ID for city) isn't quantitative so can't divide
        - they need to divide b/c 

### Urgent Tasks
- Implement other cities gated by hardcoding for data retrieval
    - We can locally store json per city for now
- Get businessType for future feature of coffee (**what other types of businesses are there?**)

### Future Tasks
- Toggle sort by ratingCount or rating or combo
- Coffee sort
    - I can add a businessType to my local json for this
- Smart splitting (for the 100 limit, if we have say 900 a 9 split factor is better than if we have 400 and want 4)
- Geocoding API can take Place ID and give us lat/lon for map view. We get 10,000 free calls a month

### Lessons
- Coming up with Future Tasks to know if my system design is good