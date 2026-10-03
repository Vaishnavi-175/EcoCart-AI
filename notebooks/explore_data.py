import json

with open("../data/raw/fashionpedia/instances_attributes_val2020.json", "r") as f:
    data = json.load(f)

print("Top-level keys:", data.keys())
print("Number of images:", len(data["images"]))
print("Number of annotations:", len(data["annotations"]))
print("Number of categories:", len(data["categories"]))
print("First category:", data["categories"][0])
print("First image info:", data["images"][0])
print("First annotation:", data["annotations"][0])
print("First attribute:", data["attributes"][0])