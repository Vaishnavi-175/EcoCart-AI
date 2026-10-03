import json
from collections import Counter
import matplotlib.pyplot as plt

with open("../data/raw/fashionpedia/instances_attributes_val2020.json", "r") as f:
    data = json.load(f)

names = {c["id"]: c["name"] for c in data["categories"]}
counts = Counter(a["category_id"] for a in data["annotations"])
top = counts.most_common(15)

labels = [names[cid] for cid, _ in top][::-1]
values = [n for _, n in top][::-1]

plt.figure(figsize=(9, 6))
plt.barh(labels, values, color="#2D6A4F")
plt.xlabel("Number of annotations")
plt.title("Fashionpedia (val set): top 15 garment categories")
plt.tight_layout()
plt.savefig("../docs/fashionpedia_categories.png", dpi=150)
print("Saved. Images:", len(data["images"]), "Annotations:", len(data["annotations"]))