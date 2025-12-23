import json

data = {
    "messages": [
        {
            "id": "19b40f580eb8e4e6",
            "internal_date": 1766321389000
        },
        {
            "id": "19b40c0a801ed9b3",
            "internal_date": 1766317926000
        },
        {
            "id": "19b40c2ab4ecbb0d",
            "internal_date": 1766317518000
        },
        {
            "id": "19b407629920f298",
            "internal_date": 1766313041000
        },
        {
            "id": "19b403482f128d05",
            "internal_date": 1766308741000
        },
        {
            "id": "19b3faf8f736dbdf",
            "internal_date": 1766300028000
        },
        {
            "id": "19b3f612cb57e5a6",
            "internal_date": 1766294891000
        },
        {
            "id": "19b3f55006e96145",
            "internal_date": 1766294092000
        },
        {
            "id": "19b3f4c2fe67d019",
            "internal_date": 1766293515000
        },
        {
            "id": "19b3f0213bf52175",
            "internal_date": 1766288658000
        },
        {
            "id": "19b3e34616fbfeca",
            "internal_date": 1766275171000
        },
        {
            "id": "19b3dccdbea60245",
            "internal_date": 1766268393000
        },
        {
            "id": "19b3dc69034293df",
            "internal_date": 1766267971000
        },
        {
            "id": "19b3d5894577c185",
            "internal_date": 1766260770000
        },
        {
            "id": "19b3ceb5d65c0948",
            "internal_date": 1766253613000
        },
        {
            "id": "19b3ce5d22723308",
            "internal_date": 1766253252000
        },
        {
            "id": "19b3ceba31089578",
            "internal_date": 1766251808000
        },
        {
            "id": "19b3cb972d1b8c06",
            "internal_date": 1766250341000
        },
        {
            "id": "19b3c943b1dc4ac6",
            "internal_date": 1766247903000
        },
        {
            "id": "19b3c83b346c0233",
            "internal_date": 1766246821000
        },
        {
            "id": "19b3c154086368d6",
            "internal_date": 1766239580000
        },
        {
            "id": "19b3c1b755211565",
            "internal_date": 1766239293000
        },
        {
            "id": "19b3b9a7f0b9eec4",
            "internal_date": 1766231016000
        },
        {
            "id": "19b3a9f569784393",
            "internal_date": 1766215079000
        },
        {
            "id": "19b3a835d7ffdb70",
            "internal_date": 1766213245000
        },
        {
            "id": "19b3a45da876dcbd",
            "internal_date": 1766209197000
        },
        {
            "id": "19b3a0876a32e27a",
            "internal_date": 1766205191000
        },
        {
            "id": "19b392098694bce7",
            "internal_date": 1766189995000
        },
        {
            "id": "19b3954e7074fe2a",
            "internal_date": 1766181572000
        }
    ]
}

last = float('inf')
for i, msg in enumerate(data['messages']):
    curr = msg['internal_date']
    if curr > last:
        print(f"Order violation at index {i}: {curr} > {last}")
    last = curr
print("Check complete")
