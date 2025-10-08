## Tasks:
- Flesh out backend fully
- Start implementing

## Backend / API Requests:
- INSIGHT_COUNT
    - After a user selects their area and triggers this, return how many places are 4.5+ and correlating cost (*$0.02)
    - The next INSIGHT_PLACES call needs to be on the exact same area as this one
    - We need to subtract the amount currently in the area for the cost of new places
    - The area filter must be **polygon** since circle is hard to divide
- INSIGHT_PLACES
    - After user confirms cost of search, this gets ran with Place Details below to get the places and their data
    - This one is capped at 100 so we figure out our subdivisions by splitting while COUNT >= 100
    - **How can we make this concurrent with Place Details for best speed?** 
        - Once we have a valid subdivision and can call PLACES, start adding those places to a queue and while len(queue) > 0, call Place Details and add to storage and remove ID from queue AFTER we store the Place ID with its details
            - *We should have a test file for this*
- Place Details

## Backlog
- Lists to store Been, Favorite
- Add filters: price levels, higher stars, higher ratings